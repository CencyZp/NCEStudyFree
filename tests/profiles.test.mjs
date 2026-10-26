import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../js/store.js';
import { ProfileManager } from '../js/profiles.js';

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

function setup(seedLegacy = false) {
  const storage = new MemoryStorage();
  if (seedLegacy) {
    storage.setItem(
      'nce-study:v1',
      JSON.stringify({
        version: 1,
        settings: { theme: 'dark' },
        progress: { 'b1-u01': { status: 'done', lastVisit: 123 } },
        notes: { 'b1-u01': 'legacy note' },
      }),
    );
  }
  const store = new Store({ storage });
  store.load();
  const manager = new ProfileManager({ storage, store });
  manager.load();
  return { storage, store, manager };
}

test('旧版单档案数据自动迁移为“我的学习”', () => {
  const { storage, store, manager } = setup(true);
  assert.equal(manager.list().length, 1);
  assert.equal(manager.active().name, '我的学习');
  assert.ok(storage.getItem(manager.dataKey(manager.activeId)));
  assert.ok(storage.getItem('nce-study:v1'), '旧键保留为备份');
  assert.equal(store.key, manager.dataKey(manager.activeId));
  assert.equal(store.state.progress['b1-u01'].status, 'done');
  assert.equal(store.state.notes['b1-u01'], 'legacy note');
});

test('新建/切换档案后进度互相隔离', () => {
  const { store, manager } = setup(false);
  const firstId = manager.activeId;
  store.markVisit('b1-u01');
  const second = manager.create('小明');
  manager.switch(second.id);
  assert.equal(store.state.progress['b1-u01'], undefined);
  store.markVisit('b2-u01');
  manager.switch(firstId);
  assert.equal(store.state.progress['b1-u01'].status, 'learning');
  assert.equal(store.state.progress['b2-u01'], undefined);
  manager.switch(second.id);
  assert.equal(store.state.progress['b2-u01'].status, 'learning');
  assert.equal(store.state.progress['b1-u01'], undefined);
});

test('重命名、同名拒绝、至少保留一个档案', () => {
  const { manager } = setup(false);
  const firstId = manager.activeId;
  const second = manager.create('小明');
  assert.throws(() => manager.create('小明'), /同名/);
  manager.rename(second.id, '小红');
  assert.equal(manager.list().find((profile) => profile.id === second.id).name, '小红');
  assert.throws(() => manager.rename(firstId, '小红'), /同名/);
  manager.remove(second.id);
  assert.throws(() => manager.remove(firstId), /至少保留/);
});

test('删除当前档案会切到剩余档案并删除其数据', () => {
  const { storage, store, manager } = setup(false);
  const firstId = manager.activeId;
  const second = manager.create('临时');
  manager.switch(second.id);
  store.markVisit('b3-u01');
  manager.remove(second.id);
  assert.equal(manager.activeId, firstId);
  assert.equal(store.state.progress['b3-u01'], undefined);
  assert.equal(storage.getItem(manager.dataKey(second.id)), null);
});

test('全部档案导出/导入保留档案与进度', () => {
  const { store, manager } = setup(true);
  store.markVisit('b1-u02');
  const second = manager.create('小明');
  manager.switch(second.id);
  store.markVisit('b3-u05');
  const backup = manager.exportAll();
  assert.match(backup, /"kind": "profiles"/);

  const fresh = setup(false);
  fresh.manager.importAll(backup);
  assert.equal(fresh.manager.list().length, 2);
  assert.equal(fresh.manager.active().name, '小明');
  assert.equal(fresh.store.state.progress['b3-u05'].status, 'learning');
  fresh.manager.switch(fresh.manager.list().find((profile) => profile.name === '我的学习').id);
  assert.equal(fresh.store.state.progress['b1-u02'].status, 'learning');
  assert.equal(fresh.store.state.notes['b1-u01'], 'legacy note');
});

test('无效多档案备份会被拒绝', () => {
  const { manager } = setup(false);
  assert.throws(() => manager.importAll('{"profiles":[]}'), /有效/);
  assert.throws(() => manager.importAll('{"profiles":[{"id":"x","name":""}],"data":{}}'), /无效/);
});
