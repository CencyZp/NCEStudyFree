/**
 * 简化 SM-2 间隔重复。
 * 评分：again / hard / good / easy
 */
export const GRADES = ['again', 'hard', 'good', 'easy'];
export const GRADE_LABELS = {
  again: '重来',
  hard: '困难',
  good: '记得',
  easy: '太简单',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const AGAIN_MINUTES = 10;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createCard(vocab, lessonId, now = Date.now()) {
  const meaning = vocab?.meanings?.[0] || {};
  return {
    id: `${lessonId}:${vocab.word}`,
    lessonId,
    word: vocab.word,
    phonetic: vocab.phonetic || '',
    pos: meaning.pos || '',
    meaning: meaning.meaning || '',
    usage: meaning.usage || '',
    ease: 2.5,
    interval: 1,
    reps: 0,
    lapses: 0,
    lastGrade: '',
    createdAt: new Date(now).toISOString(),
    due: new Date(now).toISOString(),
  };
}

export function gradeCard(card, grade, now = Date.now()) {
  const next = { ...card };
  next.reps = (next.reps || 0) + 1;
  next.lastGrade = grade;

  if (grade === 'again') {
    next.lapses = (next.lapses || 0) + 1;
    next.ease = clamp((next.ease || 2.5) - 0.2, 1.3, 3);
    next.interval = AGAIN_MINUTES / (24 * 60);
  } else if (grade === 'hard') {
    next.ease = clamp((next.ease || 2.5) - 0.15, 1.3, 3);
    next.interval = Math.max(1, (next.interval || 1) * 1.2);
  } else if (grade === 'good') {
    next.interval = Math.max(1, (next.interval || 1) * (next.ease || 2.5));
  } else {
    next.ease = clamp((next.ease || 2.5) + 0.15, 1.3, 3);
    next.interval = Math.max(1, (next.interval || 1) * (next.ease || 2.5) * 1.3);
  }

  next.due = new Date(now + next.interval * DAY_MS).toISOString();
  return next;
}

export function isDue(card, now = Date.now()) {
  return new Date(card.due).getTime() <= now;
}

export function dueLabel(card, now = Date.now()) {
  const diff = new Date(card.due).getTime() - now;
  if (diff <= 0) return '现在';
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes} 分钟后`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时后`;
  return `${Math.round(hours / 24)} 天后`;
}

export function sortByDue(cards) {
  return [...cards].sort((a, b) => new Date(a.due) - new Date(b.due));
}
