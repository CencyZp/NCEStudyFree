import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, normalizeAnswer } from '../js/exercises.js';
import { buildExercises } from '../tools/lib/exercises.mjs';

function unit() {
  return {
    id: 'b1-u01',
    sentences: [
      { en: 'Excuse me!', zh: '打扰一下！' },
      { en: 'Is this your handbag?', zh: '这是你的手提包吗？' },
      { en: 'Thank you very much.', zh: '非常感谢。' },
    ],
    vocab: [
      { word: 'handbag', phonetic: '/ˈhændbæɡ/', meanings: [{ pos: 'noun', meaning: '手提包' }] },
      { word: 'pardon', phonetic: '/ˈpɑːrdən/', meanings: [{ pos: 'interjection', meaning: '请再说一遍' }] },
    ],
    phrases: [
      { phrase: 'Excuse me', usage: '引起注意', examples: [{ en: 'Excuse me, is this your handbag?', zh: '打扰一下，这是你的手提包吗？' }] },
    ],
    grammar: [
      { title: '一般疑问句', definition: '可以用 yes 或 no 回答的疑问句', structure: 'Be + 主语 + ...?', usage: '' },
    ],
  };
}

function pools() {
  return {
    vocab: [
      ...unit().vocab,
      { word: 'letter', phonetic: '', meanings: [{ pos: 'noun', meaning: '信' }] },
      { word: 'sugar', phonetic: '', meanings: [{ pos: 'noun', meaning: '糖' }] },
      { word: 'hour', phonetic: '', meanings: [{ pos: 'noun', meaning: '小时' }] },
    ],
    grammar: [
      ...unit().grammar,
      { title: '现在进行时', definition: '正在发生', structure: 'be + doing', usage: '' },
      { title: '一般过去时', definition: '过去发生', structure: 'did', usage: '' },
    ],
    sentences: [
      ...unit().sentences,
      { en: 'This is my book.', zh: '这是我的书。' },
      { en: 'She is a teacher.', zh: '她是一名教师。' },
      { en: 'We are very busy.', zh: '我们很忙。' },
    ],
  };
}

test('normalizeAnswer 忽略大小写、标点和多余空格', () => {
  assert.equal(normalizeAnswer('  Is this your handbag? '), 'is this your handbag');
  assert.equal(normalizeAnswer('Pardon?'), 'pardon');
  assert.equal(normalizeAnswer('well-known'), 'well known');
  assert.equal(normalizeAnswer('I’m fine.'), "i'm fine");
});

test('选择题与文本题判分', () => {
  assert.equal(checkAnswer({ kind: 'choice', answer: 2 }, 2), true);
  assert.equal(checkAnswer({ kind: 'choice', answer: 2 }, '2'), true);
  assert.equal(checkAnswer({ kind: 'choice', answer: 2 }, 1), false);
  assert.equal(checkAnswer({ kind: 'text', answer: 'Pardon?' }, 'pardon'), true);
  assert.equal(checkAnswer({ kind: 'text', answer: 'Is this your handbag?' }, 'is this your handbag'), true);
  assert.equal(checkAnswer({ kind: 'text', answer: 'Is this your handbag?' }, 'this is your handbag'), false);
});

test('每课生成 4–6 道结构合法的题，且结果确定', () => {
  const first = buildExercises(unit(), pools());
  const second = buildExercises(unit(), pools());
  assert.deepEqual(first, second);
  assert.ok(first.length >= 4 && first.length <= 6);
  const ids = new Set();
  for (const question of first) {
    assert.ok(question.id);
    assert.ok(!ids.has(question.id));
    ids.add(question.id);
    assert.ok(question.prompt);
    assert.ok(question.explain);
    if (question.kind === 'choice') {
      assert.ok(question.options.length >= 2);
      assert.ok(Number.isInteger(question.answer));
      assert.ok(question.options[question.answer]);
    } else {
      assert.ok(String(question.answer).trim().length > 0);
    }
  }
});

test('数据不足时仍能生成至少 4 道题', () => {
  const sparse = {
    id: 'b1-u99',
    sentences: [{ en: 'This is a book.', zh: '这是一本书。' }],
    vocab: [{ word: 'book', phonetic: '', meanings: [{ pos: 'noun', meaning: '书' }] }],
    phrases: [],
    grammar: [],
  };
  const questions = buildExercises(sparse, {
    vocab: [sparse.vocab[0], { word: 'pen', meanings: [{ pos: 'noun', meaning: '钢笔' }] }],
    grammar: [],
    sentences: [...sparse.sentences, { en: 'That is a pen.', zh: '那是一支钢笔。' }],
  });
  assert.ok(questions.length >= 4);
});
