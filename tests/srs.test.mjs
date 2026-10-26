import test from 'node:test';
import assert from 'node:assert/strict';
import { createCard, dueLabel, gradeCard, isDue, sortByDue } from '../js/srs.js';

const vocab = { word: 'handbag', phonetic: '/ˈhændbæɡ/', meanings: [{ pos: 'noun', meaning: '手提包' }] };

test('createCard 生成可复习卡片', () => {
  const now = Date.UTC(2026, 0, 1);
  const card = createCard(vocab, 'b1-u01', now);
  assert.equal(card.id, 'b1-u01:handbag');
  assert.equal(card.word, 'handbag');
  assert.equal(card.meaning, '手提包');
  assert.equal(card.ease, 2.5);
  assert.equal(card.interval, 1);
  assert.equal(card.due, new Date(now).toISOString());
  assert.equal(isDue(card, now), true);
});

test('good 评分延长间隔，again 评分缩短间隔', () => {
  const now = Date.UTC(2026, 0, 1);
  const card = createCard(vocab, 'b1-u01', now);
  const good = gradeCard(card, 'good', now);
  assert.ok(good.interval > 1);
  assert.equal(good.reps, 1);
  assert.ok(new Date(good.due).getTime() > now);

  const again = gradeCard(good, 'again', now);
  assert.ok(again.interval < 1);
  assert.equal(again.lapses, 1);
  assert.ok(again.ease < good.ease);
  assert.ok(new Date(again.due).getTime() - now <= 11 * 60 * 1000);
});

test('ease 被限制在 1.3–3.0', () => {
  let card = createCard(vocab, 'b1-u01');
  for (let index = 0; index < 10; index += 1) card = gradeCard(card, 'easy');
  assert.ok(card.ease <= 3);
  for (let index = 0; index < 20; index += 1) card = gradeCard(card, 'again');
  assert.ok(card.ease >= 1.3);
});

test('到期标签与排序', () => {
  const now = Date.UTC(2026, 0, 1);
  const a = { ...createCard(vocab, 'b1-u01', now), due: new Date(now - 1000).toISOString() };
  const b = { ...createCard({ ...vocab, word: 'pardon' }, 'b1-u01', now), due: new Date(now + 86400000).toISOString() };
  const sorted = sortByDue([b, a]);
  assert.equal(sorted[0].word, 'handbag');
  assert.equal(dueLabel(a, now), '现在');
  assert.match(dueLabel(b, now), /小时后|天后/);
});
