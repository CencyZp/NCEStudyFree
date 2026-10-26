import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../js/store.js';

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

function makeStore() {
  const storage = new MemoryStorage();
  return { store: new Store({ storage }), storage };
}

test('空存储加载默认状态', () => {
  const { store } = makeStore();
  store.load();
  assert.equal(store.state.version, 1);
  assert.deepEqual(store.state.progress, {});
  assert.equal(store.state.settings.theme, 'system');
});

test('访问课程会记录进度、最近课程与连续天数', () => {
  const { store } = makeStore();
  store.load();
  store.markVisit('b1-u01', { id: 'b1-u01', title: 'Excuse Me', book: 1, lessonFrom: 1, lessonTo: 2 });
  assert.equal(store.state.progress['b1-u01'].status, 'learning');
  assert.equal(store.state.lastLesson, 'b1-u01');
  assert.equal(store.state.lastLessonMeta.title, 'Excuse Me');
  assert.equal(store.state.streak.current, 1);
  assert.equal(store.state.daily[Object.keys(store.state.daily)[0]].lessons[0], 'b1-u01');
});

test('答错进入错题本，连续答对两次移出', () => {
  const { store } = makeStore();
  store.load();
  const question = { id: 'b1-u01-q01', kind: 'text', answer: 'pardon', prompt: '拼写' };
  store.recordAnswer('b1-u01', question, false, 'pardom');
  assert.equal(store.state.mistakes[question.id].wrong, 1);
  store.recordAnswer('b1-u01', question, true, 'pardon');
  assert.equal(store.state.mistakes[question.id].correctStreak, 1);
  store.recordAnswer('b1-u01', question, true, 'pardon');
  assert.equal(store.state.mistakes[question.id], undefined);
});

test('生词加入、评分与到期', () => {
  const { store } = makeStore();
  store.load();
  const vocab = { word: 'handbag', phonetic: '/ˈhændbæɡ/', meanings: [{ pos: 'noun', meaning: '手提包' }] };
  assert.equal(store.addSrs(vocab, 'b1-u01'), true);
  assert.equal(store.addSrs(vocab, 'b1-u01'), false);
  const card = store.state.srs['b1-u01:handbag'];
  assert.ok(card);
  assert.equal(store.dueSrs().length, 1);
  const updated = store.gradeSrs(card.id, 'good');
  assert.ok(updated.interval > 1);
  assert.equal(store.dueSrs().length, 0);
});

test('笔记保存与删除', () => {
  const { store } = makeStore();
  store.load();
  store.saveNote('b1-u01', '  handbag = 手提包  ');
  assert.equal(store.getNote('b1-u01'), '  handbag = 手提包');
  store.saveNote('b1-u01', '   ');
  assert.equal(store.getNote('b1-u01'), '');
});

test('导出/导入往返保留进度、生词和笔记', () => {
  const { store } = makeStore();
  store.load();
  store.markVisit('b1-u01');
  store.saveNote('b1-u01', 'note');
  store.addSrs({ word: 'pardon', meanings: [{ meaning: '请再说一遍' }] }, 'b1-u01');
  const backup = store.exportData();

  const { store: restored } = makeStore();
  restored.load();
  restored.importData(backup);
  assert.equal(restored.state.progress['b1-u01'].status, 'learning');
  assert.equal(restored.state.notes['b1-u01'], 'note');
  assert.ok(restored.state.srs['b1-u01:pardon']);
});

test('损坏的 localStorage 会备份并回退默认状态', () => {
  const { store, storage } = makeStore();
  storage.setItem('nce-study:v1', '{ not json');
  store.load();
  assert.deepEqual(store.state.progress, {});
  const corruptKey = [...storage.map.keys()].find((key) => key.startsWith('nce-study:v1:corrupt:'));
  assert.ok(corruptKey);
  assert.equal(storage.getItem(corruptKey), '{ not json');
});

test('导入非法备份会抛错且不破坏现有状态', () => {
  const { store } = makeStore();
  store.load();
  store.markVisit('b1-u01');
  assert.throws(() => store.importData('{"version":1}'), /缺少/);
  assert.equal(store.state.progress['b1-u01'].status, 'learning');
});
