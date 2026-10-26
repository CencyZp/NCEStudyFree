/**
 * 本地学习状态：进度、生词 SRS、错题、笔记、设置、每日统计。
 * 所有数据只保存在浏览器 localStorage，不上传服务器。
 */
import {
  createCard,
  dueLabel,
  gradeCard,
  isDue,
  sortByDue,
} from './srs.js';

export const STORAGE_KEY = 'nce-study:v1';
export const STATE_VERSION = 1;

export function dayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function defaultState() {
  return {
    version: STATE_VERSION,
    settings: {
      theme: 'system',
      fontSize: 'md',
      ttsRate: 1,
      ttsVoice: '',
      showZh: true,
      autoPlay: false,
    },
    progress: {},
    favorites: [],
    srs: {},
    mistakes: {},
    notes: {},
    daily: {},
    streak: { current: 0, best: 0, lastDay: '' },
    lastLesson: '',
    lastLessonMeta: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeState(raw) {
  const base = defaultState();
  const parsed = isObject(raw) ? raw : {};
  const state = {
    ...base,
    ...parsed,
    version: STATE_VERSION,
    settings: { ...base.settings, ...(isObject(parsed.settings) ? parsed.settings : {}) },
    streak: { ...base.streak, ...(isObject(parsed.streak) ? parsed.streak : {}) },
  };
  for (const key of ['progress', 'srs', 'mistakes', 'notes', 'daily']) {
    state[key] = isObject(parsed[key]) ? parsed[key] : {};
  }
  state.favorites = Array.isArray(parsed.favorites) ? parsed.favorites.filter((id) => typeof id === 'string') : [];
  if (typeof state.lastLesson !== 'string') state.lastLesson = '';
  if (!isObject(state.lastLessonMeta)) state.lastLessonMeta = null;
  return state;
}

export class Store {
  constructor({ storage = globalThis.localStorage, key = STORAGE_KEY } = {}) {
    this.storage = storage;
    this.key = key;
    this.state = defaultState();
    this.listeners = new Set();
    this.saveTimer = null;
    this.lastError = null;
  }

  load() {
    let raw = null;
    try {
      raw = this.storage?.getItem(this.key) ?? null;
    } catch (error) {
      this.lastError = error;
    }
    if (!raw) {
      this.state = defaultState();
      return this.state;
    }
    try {
      const parsed = JSON.parse(raw);
      this.state = mergeState(parsed);
    } catch (error) {
      this.lastError = error;
      try {
        this.storage?.setItem(`${this.key}:corrupt:${Date.now()}`, raw);
      } catch {
        /* 忽略备份失败 */
      }
      this.state = defaultState();
      this.save(true);
    }
    return this.state;
  }

  save(immediate = false) {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const write = () => {
      try {
        this.state.updatedAt = Date.now();
        this.storage?.setItem(this.key, JSON.stringify(this.state));
      } catch (error) {
        this.lastError = error;
      }
    };
    if (immediate) {
      write();
    } else {
      this.saveTimer = setTimeout(write, 250);
    }
  }

  commit() {
    this.state.updatedAt = Date.now();
    this.save();
    this.emit();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        /* 单个订阅者失败不影响其他订阅者 */
      }
    }
  }

  updateSettings(patch) {
    this.state.settings = { ...this.state.settings, ...patch };
    this.commit();
  }

  getSettings() {
    return this.state.settings;
  }

  // ---------- 进度 ----------
  getProgress(lessonId) {
    const progress = this.state.progress[lessonId];
    return progress
      ? { status: 'new', visits: 0, bestScore: 0, ...progress }
      : { status: 'new', visits: 0, bestScore: 0 };
  }

  markVisit(lessonId, meta = null) {
    const progress = this.getProgress(lessonId);
    progress.visits = (progress.visits || 0) + 1;
    progress.lastVisit = Date.now();
    if (progress.status === 'new') progress.status = 'learning';
    if (meta) {
      progress.meta = meta;
      this.state.lastLessonMeta = meta;
    }
    this.state.progress[lessonId] = progress;
    this.state.lastLesson = lessonId;
    const day = this.touchDay();
    if (!day.lessons.includes(lessonId)) day.lessons.push(lessonId);
    this.commit();
  }

  setStatus(lessonId, status) {
    const progress = this.getProgress(lessonId);
    progress.status = status;
    if (status === 'done') {
      progress.completedAt = Date.now();
      if (!progress.bestScore) progress.bestScore = 1;
    } else {
      delete progress.completedAt;
    }
    this.state.progress[lessonId] = progress;
    this.commit();
  }

  markScore(lessonId, score) {
    const progress = this.getProgress(lessonId);
    progress.bestScore = Math.max(progress.bestScore || 0, score);
    if (score >= 0.8 && progress.status !== 'done') {
      progress.status = 'done';
      progress.completedAt = Date.now();
    }
    this.state.progress[lessonId] = progress;
    this.commit();
  }

  toggleFavorite(lessonId) {
    const index = this.state.favorites.indexOf(lessonId);
    if (index >= 0) this.state.favorites.splice(index, 1);
    else this.state.favorites.push(lessonId);
    this.commit();
    return this.state.favorites.includes(lessonId);
  }

  isFavorite(lessonId) {
    return this.state.favorites.includes(lessonId);
  }

  // ---------- 每日统计与连续天数 ----------
  touchDay(now = new Date()) {
    const today = dayKey(now);
    if (!this.state.daily[today]) {
      this.state.daily[today] = { seconds: 0, answered: 0, correct: 0, lessons: [] };
    }
    const streak = this.state.streak;
    if (streak.lastDay !== today) {
      const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      streak.current = streak.lastDay === yesterday ? (streak.current || 0) + 1 : 1;
      streak.best = Math.max(streak.best || 0, streak.current);
      streak.lastDay = today;
    }
    return this.state.daily[today];
  }

  recordStudySeconds(seconds) {
    if (!seconds || seconds <= 0) return;
    const day = this.touchDay();
    day.seconds = Math.round((day.seconds || 0) + seconds);
    this.commit();
  }

  recordAnswer(lessonId, question, correct, responseText = '', lessonMeta = null) {
    const day = this.touchDay();
    day.answered = (day.answered || 0) + 1;
    if (correct) day.correct = (day.correct || 0) + 1;
    if (!day.lessons.includes(lessonId)) day.lessons.push(lessonId);

    if (!correct) {
      const existing = this.state.mistakes[question.id] || {
        question,
        lessonId,
        wrong: 0,
        correctStreak: 0,
      };
      existing.question = question;
      existing.lessonId = lessonId;
      if (lessonMeta) existing.lessonMeta = lessonMeta;
      existing.wrong = (existing.wrong || 0) + 1;
      existing.lastWrong = Date.now();
      existing.lastAnswer = responseText;
      existing.correctStreak = 0;
      this.state.mistakes[question.id] = existing;
    } else if (this.state.mistakes[question.id]) {
      const mistake = this.state.mistakes[question.id];
      mistake.correctStreak = (mistake.correctStreak || 0) + 1;
      if (mistake.correctStreak >= 2) delete this.state.mistakes[question.id];
    }
    this.commit();
  }

  getToday() {
    return this.touchDay();
  }

  // ---------- 生词 SRS ----------
  addSrs(vocab, lessonId) {
    const card = createCard(vocab, lessonId);
    if (this.state.srs[card.id]) return false;
    this.state.srs[card.id] = card;
    this.commit();
    return true;
  }

  hasSrs(vocab, lessonId) {
    return Boolean(this.state.srs[`${lessonId}:${vocab.word}`]);
  }

  removeSrs(cardId) {
    delete this.state.srs[cardId];
    this.commit();
  }

  gradeSrs(cardId, grade) {
    const card = this.state.srs[cardId];
    if (!card) return null;
    const next = gradeCard(card, grade);
    this.state.srs[cardId] = next;
    this.touchDay();
    this.commit();
    return next;
  }

  dueSrs(now = Date.now()) {
    return sortByDue(Object.values(this.state.srs).filter((card) => isDue(card, now)));
  }

  allSrs() {
    return Object.values(this.state.srs);
  }

  srsDueLabel(card) {
    return dueLabel(card);
  }

  // ---------- 笔记 ----------
  getNote(lessonId) {
    return this.state.notes[lessonId] || '';
  }

  saveNote(lessonId, text) {
    const value = String(text || '').trimEnd();
    if (value.trim()) this.state.notes[lessonId] = value;
    else delete this.state.notes[lessonId];
    this.commit();
  }

  // ---------- 备份 ----------
  exportData() {
    return JSON.stringify(
      {
        ...this.state,
        exportedAt: new Date().toISOString(),
        app: 'NCEStudyFree',
      },
      null,
      2,
    );
  }

  importData(raw) {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!isObject(parsed)) throw new Error('备份内容不是有效对象');
    if (!isObject(parsed.progress) || !isObject(parsed.settings)) {
      throw new Error('备份缺少 progress 或 settings');
    }
    this.state = mergeState(parsed);
    this.commit();
    return true;
  }

  reset() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.state = defaultState();
    try {
      this.storage?.removeItem(this.key);
    } catch {
      /* 忽略 */
    }
    this.emit();
  }

  storageBytes() {
    try {
      return new Blob([JSON.stringify(this.state)]).size;
    } catch {
      return JSON.stringify(this.state).length;
    }
  }
}

export const store = new Store();
