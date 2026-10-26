/**
 * 本地学习档案（多用户）：
 * - 注册表：nce-study:profiles:v1
 * - 每个档案的数据：nce-study:v1:<profileId>
 * - 旧版单档案数据 nce-study:v1 会自动迁移为“我的学习”
 *
 * 所有数据仍然只保存在当前浏览器，不做账号或云端同步。
 */
export const PROFILES_KEY = 'nce-study:profiles:v1';
export const LEGACY_DATA_KEY = 'nce-study:v1';
export const MAX_PROFILES = 12;
export const PROFILE_COLORS = ['#b45309', '#1d4ed8', '#0f766e', '#6d28d9', '#be123c', '#0e7490', '#4d7c0f', '#a21caf'];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function cleanName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
}

export function profileInitial(name) {
  const text = cleanName(name);
  if (!text) return '学';
  return [...text][0];
}

export class ProfileManager {
  constructor({ storage = globalThis.localStorage, store, key = PROFILES_KEY } = {}) {
    this.storage = storage;
    this.store = store;
    this.key = key;
    this.profiles = [];
    this.activeId = '';
    this.listeners = new Set();
  }

  dataKey(id) {
    return `${LEGACY_DATA_KEY}:${id}`;
  }

  load() {
    let raw = null;
    try {
      raw = this.storage?.getItem(this.key) ?? null;
    } catch {
      raw = null;
    }
    const registry = this.readRegistry(raw);
    if (registry) {
      this.profiles = registry.profiles;
      this.activeId = registry.activeId;
    } else {
      const id = this.uniqueId('default');
      this.profiles = [
        { id, name: '我的学习', color: PROFILE_COLORS[0], createdAt: Date.now() },
      ];
      this.activeId = id;
      this.migrateLegacy(id);
      this.saveRegistry();
    }

    this.store.setKey(this.dataKey(this.activeId));
    this.emit();
    return this.active();
  }

  readRegistry(raw) {
    const text = raw === undefined ? this.storage?.getItem(this.key) : raw;
    if (!text) return null;
    const parsed = safeParse(text);
    if (!isObject(parsed) || !Array.isArray(parsed.profiles)) return null;

    const seen = new Set();
    const profiles = [];
    for (const item of parsed.profiles) {
      if (
        !isObject(item) ||
        typeof item.id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,48}$/.test(item.id) ||
        typeof item.name !== 'string' ||
        seen.has(item.id)
      ) {
        continue;
      }
      const name = cleanName(item.name);
      if (!name) continue;
      seen.add(item.id);
      profiles.push({
        id: item.id,
        name,
        color:
          typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color)
            ? item.color
            : PROFILE_COLORS[profiles.length % PROFILE_COLORS.length],
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
      });
      if (profiles.length >= MAX_PROFILES) break;
    }
    if (!profiles.length) return null;
    return {
      profiles,
      activeId: profiles.some((profile) => profile.id === parsed.activeId)
        ? parsed.activeId
        : profiles[0].id,
    };
  }

  saveRegistry() {
    try {
      this.storage?.setItem(
        this.key,
        JSON.stringify({ version: 1, activeId: this.activeId, profiles: this.profiles }),
      );
    } catch {
      /* 存储不可用时由 Store 的错误提示兜底 */
    }
  }

  migrateLegacy(id) {
    try {
      const legacy = this.storage?.getItem(LEGACY_DATA_KEY);
      const target = this.dataKey(id);
      if (legacy && !this.storage.getItem(target)) {
        this.storage.setItem(target, legacy);
      }
    } catch {
      /* 忽略迁移失败，Store 会以空档案启动 */
    }
  }

  uniqueId(prefix = 'p') {
    let id = '';
    do {
      id = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    } while (this.profiles.some((profile) => profile.id === id));
    return id;
  }

  active() {
    return this.profiles.find((profile) => profile.id === this.activeId) || null;
  }

  list() {
    return this.profiles.map((profile) => ({ ...profile }));
  }

  create(name) {
    const nextName = cleanName(name);
    if (!nextName) throw new Error('档案名称不能为空');
    if (this.profiles.length >= MAX_PROFILES) throw new Error(`最多支持 ${MAX_PROFILES} 个本地档案`);
    if (this.profiles.some((profile) => profile.name === nextName)) {
      throw new Error('已经有同名档案');
    }
    const profile = {
      id: this.uniqueId('p'),
      name: nextName,
      color: PROFILE_COLORS[this.profiles.length % PROFILE_COLORS.length],
      createdAt: Date.now(),
    };
    this.profiles.push(profile);
    this.saveRegistry();
    this.emit();
    return { ...profile };
  }

  rename(id, name) {
    const nextName = cleanName(name);
    if (!nextName) throw new Error('档案名称不能为空');
    const profile = this.profiles.find((item) => item.id === id);
    if (!profile) throw new Error('档案不存在');
    if (this.profiles.some((item) => item.id !== id && item.name === nextName)) {
      throw new Error('已经有同名档案');
    }
    profile.name = nextName;
    this.saveRegistry();
    this.emit();
    return { ...profile };
  }

  switch(id) {
    const profile = this.profiles.find((item) => item.id === id);
    if (!profile) throw new Error('档案不存在');
    if (id === this.activeId) return { ...profile };
    this.store.setKey(this.dataKey(id));
    this.activeId = id;
    this.saveRegistry();
    this.emit();
    return { ...profile };
  }

  remove(id) {
    if (this.profiles.length <= 1) throw new Error('至少保留一个档案');
    const profile = this.profiles.find((item) => item.id === id);
    if (!profile) throw new Error('档案不存在');

    if (id === this.activeId) {
      const fallback = this.profiles.find((item) => item.id !== id);
      this.store.setKey(this.dataKey(fallback.id));
      this.activeId = fallback.id;
    }
    this.profiles = this.profiles.filter((item) => item.id !== id);
    try {
      this.storage?.removeItem(this.dataKey(id));
    } catch {
      /* 忽略删除失败 */
    }
    this.saveRegistry();
    this.emit();
  }

  exportAll() {
    this.store.save(true);
    const data = {};
    for (const profile of this.profiles) {
      try {
        const raw = this.storage?.getItem(this.dataKey(profile.id));
        if (raw) data[profile.id] = JSON.parse(raw);
      } catch {
        /* 忽略单个档案的读取错误 */
      }
    }
    return JSON.stringify(
      {
        app: 'NCEStudyFree',
        kind: 'profiles',
        version: 1,
        exportedAt: new Date().toISOString(),
        activeId: this.activeId,
        profiles: this.profiles,
        data,
      },
      null,
      2,
    );
  }

  importAll(raw) {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!isObject(parsed) || !Array.isArray(parsed.profiles) || !isObject(parsed.data)) {
      throw new Error('不是有效的多档案备份');
    }
    const registry = this.readRegistry(
      JSON.stringify({ profiles: parsed.profiles, activeId: parsed.activeId }),
    );
    if (!registry) throw new Error('备份中的档案列表无效');

    this.store.save(true);
    for (const profile of registry.profiles) {
      const state = parsed.data[profile.id];
      if (isObject(state)) {
        try {
          this.storage?.setItem(this.dataKey(profile.id), JSON.stringify(state));
        } catch {
          throw new Error('写入本地存储失败，备份可能过大');
        }
      }
    }
    this.profiles = registry.profiles;
    this.activeId = registry.activeId;
    this.saveRegistry();
    this.store.setKey(this.dataKey(this.activeId), { saveCurrent: false });
    this.store.reload();
    this.emit();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch {
        /* 忽略单个订阅者错误 */
      }
    }
  }

  watchExternalChanges() {
    if (typeof window === 'undefined') return () => {};
    const onStorage = (event) => {
      if (event.key !== this.key) return;
      const registry = this.readRegistry(event.newValue);
      if (!registry) return;
      const activeChanged = registry.activeId !== this.activeId;
      this.profiles = registry.profiles;
      if (activeChanged) {
        this.activeId = registry.activeId;
        this.store.setKey(this.dataKey(this.activeId));
      }
      this.emit();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }
}
