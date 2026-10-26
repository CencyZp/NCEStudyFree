#!/usr/bin/env node
/**
 * 将 sources/ 中的 LRC 与 notes 合并为前端可直接加载的课级数据。
 *
 * 输出：
 *   data/books.js          四册元数据
 *   data/book1.js ...      每册课级数据（含课文、词汇、语法、练习）
 *   data/search-index.js   轻量搜索索引
 *   docs/data-report.json  构建统计与警告
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseLrc, cleanText } from './lib/lrc.mjs';
import { buildExercises, optionKey } from './lib/exercises.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'sources');
const DATA_DIR = path.join(ROOT, 'data');
const DOCS_DIR = path.join(ROOT, 'docs');

const BOOKS = [
  {
    id: 1,
    key: 'NCE1',
    title: 'First Things First',
    titleZh: '英语初阶',
    level: '入门',
    color: '#b45309',
    description: '从问候、日常句型与基础语法起步，建立语音、词汇和语感。',
  },
  {
    id: 2,
    key: 'NCE2',
    title: 'Practice and Progress',
    titleZh: '实践与进步',
    level: '基础',
    color: '#1d4ed8',
    description: '系统梳理时态、从句与常见表达，听说读写同步提升。',
  },
  {
    id: 3,
    key: 'NCE3',
    title: 'Developing Skills',
    titleZh: '培养技能',
    level: '进阶',
    color: '#0f766e',
    description: '训练长句、篇章结构与地道表达，进阶阅读与写作。',
  },
  {
    id: 4,
    key: 'NCE4',
    title: 'Fluency in English',
    titleZh: '流利英语',
    level: '高阶',
    color: '#6d28d9',
    description: '阅读学术与思辨性文章，掌握复杂句、论证与流利表达。',
  },
];

function jsJson(value) {
  return JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
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

function unitKey(filename) {
  const match = String(filename).match(/^(\d+)(?:&(\d+))?/);
  if (!match) throw new Error(`无法解析课号：${filename}`);
  return match[2] ? `${match[1]}-${match[2]}` : match[1];
}

function lessonRange(key) {
  const parts = key.split('-').map(Number);
  return [parts[0], parts[1] || parts[0]];
}

function catalogTitle(unit) {
  const raw = cleanText(unit.title || unit.filename || '');
  return (
    raw.replace(/^\d{1,3}(?:&\d{1,3})?\s*[.\-–]?\s*/, '').trim() || raw
  );
}

function normalizeExamples(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (typeof item === 'string') return { en: cleanText(item), zh: '' };
      return {
        en: cleanText(item?.en || item?.english || ''),
        zh: cleanText(item?.zh || item?.chinese || ''),
      };
    })
    .filter((item) => item.en);
}

function normalizeVocab(list) {
  if (!Array.isArray(list)) return [];
  const normalized = list
    .map((item) => ({
      word: cleanText(item?.word || item?.term || ''),
      phonetic: cleanText(item?.phonetic || item?.ipa || ''),
      meanings: (Array.isArray(item?.meanings) ? item.meanings : [])
        .map((meaning) => ({
          pos: cleanText(meaning?.pos || meaning?.partOfSpeech || ''),
          meaning: cleanText(meaning?.meaning || meaning?.zh || ''),
          usage: cleanText(meaning?.usage || ''),
        }))
        .filter((meaning) => meaning.meaning),
    }))
    .filter((item) => item.word && item.meanings.length);
  return uniqueBy(normalized, (item) => item.word.toLowerCase());
}

function normalizePhrases(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => ({
      phrase: cleanText(item?.phrase || item?.text || ''),
      usage: cleanText(item?.usage || item?.explanation || ''),
      examples: normalizeExamples(item?.examples),
    }))
    .filter((item) => item.phrase);
}

function normalizeGrammar(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => ({
      title: cleanText(item?.title || item?.name || ''),
      definition: cleanText(item?.definition || item?.explanation || ''),
      structure: cleanText(item?.structure || ''),
      usage: cleanText(item?.usage || ''),
      examples: normalizeExamples(item?.examples),
    }))
    .filter((item) => item.title || item.definition);
}

function normalizePatterns(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (typeof item === 'string') {
        return { pattern: cleanText(item), explanation: '', original: null, examples: [] };
      }
      const original = item?.original
        ? { en: cleanText(item.original.en), zh: cleanText(item.original.zh) }
        : null;
      return {
        pattern: cleanText(item?.pattern || item?.title || item?.sentence || ''),
        explanation: cleanText(item?.explanation || item?.usage || ''),
        original: original?.en ? original : null,
        examples: normalizeExamples(item?.imitations || item?.examples),
      };
    })
    .filter((item) => item.pattern);
}

async function readJsonFile(file) {
  const text = (await readFile(file, 'utf8')).replace(/^\uFEFF/, '');
  return JSON.parse(text);
}

async function main() {
  const generatedAt = new Date().toISOString();
  const warnings = [];
  const errors = [];
  const booksMeta = [];
  const searchIndex = [];
  const reports = [];

  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(DOCS_DIR, { recursive: true });

  for (const book of BOOKS) {
    const catalog = await readJsonFile(path.join(SOURCE_DIR, 'books', `${book.key}.json`));
    const catalogUnits = Array.isArray(catalog.units) ? catalog.units : [];
    if (!catalogUnits.length) {
      errors.push(`${book.key}: book.json 没有 units`);
      continue;
    }

    const units = [];
    for (let index = 0; index < catalogUnits.length; index += 1) {
      const entry = catalogUnits[index];
      const key = unitKey(entry.filename);
      const [lessonFrom, lessonTo] = lessonRange(key);
      const id = `b${book.id}-u${String(index + 1).padStart(2, '0')}`;
      const fallbackTitle = catalogTitle(entry);

      let lrcText = '';
      try {
        lrcText = await readFile(path.join(SOURCE_DIR, 'lrc', book.key, `${key}.lrc`), 'utf8');
      } catch {
        errors.push(`${book.key}/${key}: 缺少 LRC`);
      }

      let notes = null;
      try {
        notes = await readJsonFile(path.join(SOURCE_DIR, 'notes', book.key, `${key}.json`));
      } catch {
        warnings.push(`${book.key}/${key}: 缺少 notes，词汇/语法为空`);
      }

      const parsed = parseLrc(lrcText, {
        fallbackTitle,
        extractQuestion: book.id > 1,
      });

      const title = cleanText(parsed.title) || fallbackTitle || `Lesson ${lessonFrom}`;
      const notesQuestion =
        notes?.title && /[?？]/.test(notes.title) ? cleanText(notes.title) : '';
      const question = cleanText(parsed.question) || notesQuestion;

      const unit = {
        id,
        book: book.id,
        unit: index + 1,
        key,
        lessonFrom,
        lessonTo,
        title,
        titleZh: cleanText(parsed.titleZh),
        question,
        sentences: parsed.sentences,
        vocab: normalizeVocab(notes?.vocabulary),
        phrases: normalizePhrases(notes?.phrases),
        grammar: normalizeGrammar(notes?.grammar),
        patterns: normalizePatterns(notes?.sentencePatterns),
        exercises: [],
      };

      if (!unit.sentences.length) errors.push(`${book.key}/${key}: 课文句子为空`);
      if (!unit.title) errors.push(`${book.key}/${key}: 标题为空`);
      if (!unit.vocab.length) warnings.push(`${book.key}/${key}: 词汇为空`);
      units.push(unit);
    }

    // 同册题库池：为选择题提供干扰项
    const pools = {
      vocab: uniqueBy(
        units.flatMap((unit) => unit.vocab),
        (item) => item.word.toLowerCase(),
      ),
      grammar: uniqueBy(
        units.flatMap((unit) => unit.grammar),
        (item) => optionKey(item.title),
      ),
      sentences: uniqueBy(
        units.flatMap((unit) => unit.sentences),
        (item) => (item.zh || item.en).toLowerCase(),
      ),
    };

    for (const unit of units) {
      unit.exercises = buildExercises(unit, pools);
      if (unit.exercises.length < 4) {
        warnings.push(`${unit.id}: 练习题只有 ${unit.exercises.length} 道`);
      }
    }

    const sentenceCount = units.reduce((sum, unit) => sum + unit.sentences.length, 0);
    const bilingualCount = units.reduce(
      (sum, unit) => sum + unit.sentences.filter((sentence) => sentence.zh).length,
      0,
    );
    const vocabCount = units.reduce((sum, unit) => sum + unit.vocab.length, 0);
    const phraseCount = units.reduce((sum, unit) => sum + unit.phrases.length, 0);
    const grammarCount = units.reduce((sum, unit) => sum + unit.grammar.length, 0);
    const patternCount = units.reduce((sum, unit) => sum + unit.patterns.length, 0);
    const exerciseCount = units.reduce((sum, unit) => sum + unit.exercises.length, 0);
    const lessonCount = units.reduce(
      (sum, unit) => sum + (unit.lessonTo - unit.lessonFrom + 1),
      0,
    );

    const meta = {
      id: book.id,
      key: book.key,
      title: book.title,
      titleZh: book.titleZh,
      level: book.level,
      color: book.color,
      description: book.description,
      units: units.length,
      lessons: lessonCount,
      sentences: sentenceCount,
      vocab: vocabCount,
      phrases: phraseCount,
      grammar: grammarCount,
      patterns: patternCount,
      exercises: exerciseCount,
      bilingualRatio: sentenceCount ? bilingualCount / sentenceCount : 0,
    };
    booksMeta.push(meta);
    reports.push(meta);

    const bookPayload = { id: book.id, key: book.key, units };
    await writeFile(
      path.join(DATA_DIR, `book${book.id}.js`),
      `window.NCE = window.NCE || {};\nwindow.NCE.booksData = window.NCE.booksData || {};\nwindow.NCE.booksData[${book.id}] = ${jsJson(bookPayload)};\n`,
      'utf8',
    );

    for (const unit of units) {
      searchIndex.push({
        id: unit.id,
        book: unit.book,
        unit: unit.unit,
        lessonFrom: unit.lessonFrom,
        lessonTo: unit.lessonTo,
        title: unit.title,
        titleZh: unit.titleZh,
        words: unit.vocab.map((item) => item.word),
        meanings: unit.vocab.flatMap((item) => item.meanings.map((meaning) => meaning.meaning)),
        phrases: unit.phrases.map((item) => item.phrase),
      });
    }

    console.log(
      `${book.key}: ${units.length} 单元 / ${lessonCount} 课 / ${sentenceCount} 句 / ${exerciseCount} 题`,
    );
  }

  await writeFile(
    path.join(DATA_DIR, 'books.js'),
    `window.NCE = window.NCE || {};\nwindow.NCE.books = ${jsJson(booksMeta)};\n`,
    'utf8',
  );
  await writeFile(
    path.join(DATA_DIR, 'search-index.js'),
    `window.NCE = window.NCE || {};\nwindow.NCE.searchIndex = ${jsJson(searchIndex)};\n`,
    'utf8',
  );

  const totals = {
    books: booksMeta.length,
    units: booksMeta.reduce((sum, book) => sum + book.units, 0),
    lessons: booksMeta.reduce((sum, book) => sum + book.lessons, 0),
    sentences: booksMeta.reduce((sum, book) => sum + book.sentences, 0),
    vocab: booksMeta.reduce((sum, book) => sum + book.vocab, 0),
    phrases: booksMeta.reduce((sum, book) => sum + book.phrases, 0),
    grammar: booksMeta.reduce((sum, book) => sum + book.grammar, 0),
    patterns: booksMeta.reduce((sum, book) => sum + book.patterns, 0),
    exercises: booksMeta.reduce((sum, book) => sum + book.exercises, 0),
    bilingualRatio:
      booksMeta.reduce((sum, book) => sum + book.sentences, 0) > 0
        ? booksMeta.reduce((sum, book) => sum + book.bilingualRatio * book.sentences, 0) /
          booksMeta.reduce((sum, book) => sum + book.sentences, 0)
        : 0,
  };

  const report = {
    generatedAt,
    sources: {
      lrc: 'iChochy/NCE (https://nce.mleo.site)',
      notes: 'LiDuoMiao/new-concept-english (MIT)',
    },
    totals,
    books: reports,
    warnings,
    errors,
  };
  await writeFile(
    path.join(DOCS_DIR, 'data-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );

  console.log('\n=== 汇总 ===');
  console.log(JSON.stringify(totals, null, 2));
  console.log(`warnings: ${warnings.length}, errors: ${errors.length}`);
  if (warnings.length) {
    console.log('\n警告（前 20 条）：');
    for (const warning of warnings.slice(0, 20)) console.log(`  - ${warning}`);
    if (warnings.length > 20) console.log(`  ... 另有 ${warnings.length - 20} 条`);
  }
  if (errors.length) {
    console.log('\n错误（前 20 条）：');
    for (const error of errors.slice(0, 20)) console.log(`  - ${error}`);
    if (errors.length > 20) console.log(`  ... 另有 ${errors.length - 20} 条`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
