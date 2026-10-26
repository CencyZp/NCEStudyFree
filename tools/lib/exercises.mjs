/**
 * 由课文、词汇、短语、语法自动生成课级练习。
 * 生成过程确定性：同一课 id 每次构建得到相同题目。
 */

export function hashSeed(input) {
  let hash = 2166136261;
  const text = String(input);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeAnswer(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[.,!?;:，。！？；：、]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shuffle(items, random) {
  const array = [...items];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [array[index], array[swap]] = [array[swap], array[index]];
  }
  return array;
}

function pick(items, random) {
  return items[Math.floor(random() * items.length)];
}

function pickMany(items, count, random) {
  return shuffle(items, random).slice(0, count);
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function firstMeaning(vocab) {
  return vocab?.meanings?.find((meaning) => meaning?.meaning) || null;
}

function wordCount(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'at', 'for', 'with',
  'from', 'by', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'this', 'that',
  'these', 'those', 'it', 'its', 'he', 'she', 'they', 'we', 'you', 'i', 'his', 'her',
  'their', 'our', 'my', 'your', 'not', 'no', 'so', 'do', 'does', 'did', 'have', 'has',
  'had', 'will', 'would', 'can', 'could', 'may', 'might', 'must', 'shall', 'should',
]);

function choiceOptions(correct, distractors, random, maxOptions = 4) {
  const unique = uniqueBy(distractors, (item) => String(item).trim().toLowerCase()).filter(
    (item) => String(item).trim().toLowerCase() !== String(correct).trim().toLowerCase(),
  );
  if (!unique.length) return null;
  const options = shuffle([correct, ...pickMany(unique, maxOptions - 1, random)], random);
  return { options, answer: options.indexOf(correct) };
}

function explainVocab(vocab) {
  const meaning = firstMeaning(vocab);
  const parts = [
    vocab.word,
    vocab.phonetic,
    meaning?.pos,
    meaning?.meaning,
  ].filter(Boolean);
  const base = parts.join(' · ');
  return meaning?.usage ? `${base}。${meaning.usage}` : base;
}

function makeVocabChoice(unit, pools, random) {
  if (!unit.vocab.length) return null;
  const vocab = pick(unit.vocab, random);
  const meaning = firstMeaning(vocab);
  if (!meaning) return null;
  const options = choiceOptions(
    vocab.word,
    pools.vocab
      .filter((item) => firstMeaning(item)?.meaning !== meaning.meaning)
      .map((item) => item.word),
    random,
  );
  if (!options) return null;
  return {
    type: 'vocab-choice',
    kind: 'choice',
    prompt: `“${meaning.meaning}” 对应的单词是？`,
    hint: [meaning.pos, vocab.phonetic].filter(Boolean).join(' · '),
    options: options.options,
    answer: options.answer,
    explain: explainVocab(vocab),
    source: { kind: 'vocab', word: vocab.word },
  };
}

function makeSpell(unit, random) {
  if (!unit.vocab.length) return null;
  const vocab = pick(unit.vocab, random);
  const meaning = firstMeaning(vocab);
  if (!meaning) return null;
  return {
    type: 'spell',
    kind: 'text',
    prompt: `根据释义和音标拼写单词：${meaning.meaning}`,
    hint: [vocab.phonetic, meaning.pos].filter(Boolean).join(' · '),
    answer: vocab.word,
    placeholder: '输入英文单词',
    explain: explainVocab(vocab),
    source: { kind: 'vocab', word: vocab.word },
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makePhraseFill(unit, random) {
  const candidates = unit.phrases.filter(
    (phrase) =>
      phrase.phrase &&
      phrase.phrase.length >= 3 &&
      phrase.examples?.some((example) => example.en && new RegExp(escapeRegExp(phrase.phrase), 'i').test(example.en)),
  );
  if (!candidates.length) return null;
  const phrase = pick(candidates, random);
  const example = pick(
    phrase.examples.filter((item) => new RegExp(escapeRegExp(phrase.phrase), 'i').test(item.en)),
    random,
  );
  const blanked = example.en.replace(new RegExp(escapeRegExp(phrase.phrase), 'i'), '_____');
  return {
    type: 'phrase-fill',
    kind: 'text',
    prompt: `补全短语：${blanked}`,
    hint: example.zh,
    answer: phrase.phrase,
    placeholder: '输入缺失的短语',
    explain: `${phrase.phrase}：${phrase.usage || '常用短语'}${example.zh ? `（${example.zh}）` : ''}`,
    source: { kind: 'phrase', phrase: phrase.phrase },
  };
}

function makeCloze(unit, random) {
  const candidates = unit.sentences.filter((sentence) => {
    const count = wordCount(sentence.en);
    return count >= 5 && count <= 35;
  });
  if (!candidates.length) return null;
  const sentence = pick(candidates, random);
  const tokens = sentence.en.split(/\s+/);
  const tokenIndexes = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => {
      const word = token.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '');
      return word.length >= 4 && !STOP_WORDS.has(word.toLowerCase());
    });
  if (!tokenIndexes.length) return null;
  const chosen = pick(tokenIndexes, random);
  const bareWord = chosen.token.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '');
  const blanked = tokens.map((token, index) => (index === chosen.index ? '_____' : token)).join(' ');
  return {
    type: 'cloze',
    kind: 'text',
    prompt: `补全句子：${blanked}`,
    hint: sentence.zh,
    answer: bareWord,
    placeholder: '输入缺失的单词',
    explain: `${sentence.en}${sentence.zh ? ` — ${sentence.zh}` : ''}`,
    source: { kind: 'sentence', en: sentence.en },
  };
}

function makeGrammarChoice(unit, pools, random) {
  const candidates = unit.grammar.filter((item) => item.title && item.definition);
  if (!candidates.length) return null;
  const grammar = pick(candidates, random);
  const options = choiceOptions(
    grammar.title,
    pools.grammar.filter((item) => item.title && item.title !== grammar.title).map((item) => item.title),
    random,
  );
  if (!options) return null;
  return {
    type: 'grammar-choice',
    kind: 'choice',
    prompt: `“${grammar.definition}” 描述的是哪个语法点？`,
    hint: grammar.structure || '',
    options: options.options,
    answer: options.answer,
    explain: [grammar.title, grammar.structure, grammar.usage].filter(Boolean).join('：'),
    source: { kind: 'grammar', title: grammar.title },
  };
}

function makeTranslationChoice(unit, pools, random) {
  const candidates = unit.sentences.filter((sentence) => sentence.en && sentence.zh && sentence.zh.length >= 2);
  if (!candidates.length) return null;
  const sentence = pick(candidates, random);
  const options = choiceOptions(
    sentence.zh,
    pools.sentences.filter((item) => item.zh && item.zh !== sentence.zh).map((item) => item.zh),
    random,
  );
  if (!options) return null;
  return {
    type: 'translation-choice',
    kind: 'choice',
    prompt: `选出下面句子的正确中文意思：\n${sentence.en}`,
    hint: '',
    options: options.options,
    answer: options.answer,
    explain: `${sentence.en} — ${sentence.zh}`,
    source: { kind: 'sentence', en: sentence.en },
  };
}

function makeDictation(unit, random) {
  const candidates = unit.sentences.filter((sentence) => {
    const count = wordCount(sentence.en);
    return count >= 4 && count <= 20 && /[A-Za-z]/.test(sentence.en);
  });
  if (!candidates.length) return null;
  const sentence = pick(candidates, random);
  return {
    type: 'dictation',
    kind: 'text',
    prompt: '听写：点击播放，写出你听到的句子。',
    hint: `共 ${wordCount(sentence.en)} 个单词`,
    answer: sentence.en,
    placeholder: '输入完整英文句子',
    explain: `${sentence.en}${sentence.zh ? ` — ${sentence.zh}` : ''}`,
    playText: sentence.en,
    source: { kind: 'sentence', en: sentence.en },
  };
}

/**
 * @param {object} unit 课级数据
 * @param {{vocab: object[], grammar: object[], sentences: object[]}} pools 同册题库池
 * @returns {object[]} 6 道题（数据不足时至少 4 道）
 */
export function buildExercises(unit, pools) {
  const random = mulberry32(hashSeed(unit.id));
  const questions = [];
  const seen = new Set();
  const usedVocab = new Set();

  const add = (question) => {
    if (!question) return false;
    const key = `${question.type}:${question.answer}:${question.prompt}`;
    if (seen.has(key)) return false;
    // 同一课里尽量不重复考同一个单词
    if (['vocab-choice', 'spell'].includes(question.type) && question.source?.word) {
      if (usedVocab.has(question.source.word)) return false;
      usedVocab.add(question.source.word);
    }
    seen.add(key);
    questions.push(question);
    return true;
  };

  const makers = [
    () => makeVocabChoice(unit, pools, random),
    () => makeSpell(unit, random),
    () => makePhraseFill(unit, random),
    () => makeCloze(unit, random),
    () => makeGrammarChoice(unit, pools, random),
    () => makeTranslationChoice(unit, pools, random),
    () => makeDictation(unit, random),
  ];

  for (const make of makers) {
    if (questions.length >= 6) break;
    add(make());
  }

  // 题量不足时补充变体，优先词汇与句子类
  const fillers = [
    () => makeSpell(unit, random),
    () => makeCloze(unit, random),
    () => makeTranslationChoice(unit, pools, random),
    () => makeVocabChoice(unit, pools, random),
    () => makeDictation(unit, random),
  ];
  for (let attempt = 0; questions.length < 4 && attempt < 30; attempt += 1) {
    add(pick(fillers, random)());
  }

  return questions.slice(0, 6).map((question, index) => ({
    ...question,
    id: `${unit.id}-q${String(index + 1).padStart(2, '0')}`,
  }));
}
