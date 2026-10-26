import { h, icon, formatPercent, formatMinutes, formatDate, formatShortDate } from '../ui.js';
import { dayKey } from '../store.js';

const STATUS_LABELS = { new: '未学', learning: '学习中', done: '已完成' };

function bookStats(store, book) {
  const prefix = `b${book.id}-`;
  const entries = Object.entries(store.state.progress).filter(([id]) => id.startsWith(prefix));
  const done = entries.filter(([, progress]) => progress.status === 'done').length;
  const learning = entries.filter(([, progress]) => progress.status === 'learning').length;
  return { done, learning, total: book.units, percent: book.units ? done / book.units : 0 };
}

function lastSevenDays(store) {
  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = dayKey(date);
    const entry = store.state.daily?.[key] || { answered: 0, correct: 0, seconds: 0 };
    days.push({
      key,
      label: formatShortDate(date),
      weekday: ['日', '一', '二', '三', '四', '五', '六'][date.getDay()],
      ...entry,
    });
  }
  return days;
}

export async function renderStats(container, ctx) {
  const { store } = ctx;
  const books = window.NCE.books;
  const totalUnits = books.reduce((sum, book) => sum + book.units, 0);
  const progress = store.state.progress;
  const done = Object.values(progress).filter((item) => item.status === 'done').length;
  const learning = Object.values(progress).filter((item) => item.status === 'learning').length;
  const today = store.state.daily?.[dayKey()] || { answered: 0, correct: 0, seconds: 0 };
  const accuracy = today.answered ? today.correct / today.answered : 0;
  const due = store.dueSrs().length;
  const allSrs = store.allSrs().length;
  const mastered = store.allSrs().filter((card) => (card.interval || 0) >= 21).length;
  const mistakeCount = Object.keys(store.state.mistakes).length;
  const days = lastSevenDays(store);
  const maxAnswered = Math.max(1, ...days.map((day) => day.answered || 0));
  const streak = store.state.streak || { current: 0, best: 0 };
  const recent = Object.entries(progress)
    .filter(([, item]) => item.lastVisit)
    .sort((a, b) => b[1].lastVisit - a[1].lastVisit)
    .slice(0, 6);

  const statCards = h(
    'section',
    { class: 'stat-grid' },
    h(
      'div',
      { class: 'stat-card large' },
      h('span', { class: 'stat-icon' }, icon('check', 20)),
      h('div', {}, h('strong', {}, `${done}`), h('span', {}, ` / ${totalUnits} 单元完成`), h('small', {}, `学习中 ${learning}`)),
    ),
    h(
      'div',
      { class: 'stat-card large' },
      h('span', { class: 'stat-icon' }, icon('clock', 20)),
      h('div', {}, h('strong', {}, `${streak.current || 0}`), h('span', {}, ' 天连续学习'), h('small', {}, `最长 ${streak.best || 0} 天`)),
    ),
    h(
      'div',
      { class: 'stat-card large' },
      h('span', { class: 'stat-icon' }, icon('chart', 20)),
      h('div', {}, h('strong', {}, `${formatPercent(accuracy)}`), h('span', {}, ' 今日正确率'), h('small', {}, `答题 ${today.answered || 0} 道 · ${formatMinutes(today.seconds || 0)}`)),
    ),
    h(
      'div',
      { class: 'stat-card large' },
      h('span', { class: 'stat-icon' }, icon('layers', 20)),
      h('div', {}, h('strong', {}, `${due}`), h('span', {}, ' 张到期生词'), h('small', {}, `生词本 ${allSrs} · 已掌握 ${mastered}`)),
    ),
  );

  const bookRows = h(
    'div',
    { class: 'book-stat-list' },
    books.map((book) => {
      const stats = bookStats(store, book);
      return h(
        'a',
        { class: 'book-stat-row', href: `#/book/${book.id}`, style: { '--book-color': book.color } },
        h('span', { class: 'book-stat-dot' }),
        h(
          'div',
          { class: 'book-stat-main' },
          h('strong', {}, `${book.titleZh} · ${book.title}`),
          h(
            'div',
            { class: 'progress-track' },
            h('span', { style: { width: `${Math.round(stats.percent * 100)}%` } }),
          ),
        ),
        h('span', { class: 'book-stat-numbers' }, `${stats.done} / ${stats.total}`),
        h('span', { class: 'muted' }, formatPercent(stats.percent)),
      );
    }),
  );

  const chart = h(
    'div',
    { class: 'bar-chart', role: 'img', 'aria-label': '最近七天答题数' },
    days.map((day) =>
      h(
        'div',
        { class: 'bar-col', title: `${day.key}：${day.answered || 0} 题` },
        h('span', { class: 'bar-value' }, day.answered ? String(day.answered) : ''),
        h(
          'div',
          { class: 'bar-track' },
          h('span', {
            style: {
              height: `${day.answered ? Math.max(6, Math.round((day.answered / maxAnswered) * 100)) : 3}%`,
            },
          }),
        ),
        h('span', { class: 'bar-label' }, day.weekday),
      ),
    ),
  );

  const recentList = recent.length
    ? h(
        'div',
        { class: 'recent-list' },
        recent.map(([id, item]) => {
          const meta = item.meta;
          const title = meta?.title || id;
          const subtitle = meta
            ? `第 ${meta.book} 册 · Lesson ${meta.lessonFrom}${meta.lessonTo !== meta.lessonFrom ? `–${meta.lessonTo}` : ''}`
            : id;
          return h(
            'a',
            { class: 'recent-row', href: `#/lesson/${id}` },
            h('div', {}, h('strong', {}, title), h('span', { class: 'muted' }, subtitle)),
            h('span', { class: `status-badge status-${item.status || 'new'}` }, STATUS_LABELS[item.status] || item.status),
            h('span', { class: 'muted recent-date' }, formatDate(item.lastVisit)),
          );
        }),
      )
    : h('p', { class: 'muted' }, '还没有学习记录。从第一课开始，这里会显示你的学习轨迹。');

  container.append(
    h(
      'header',
      { class: 'page-head' },
      h('p', { class: 'eyebrow' }, '学习数据'),
      h('h1', {}, '统计'),
      h('p', { class: 'muted' }, '所有统计来自当前浏览器里的本地学习记录。'),
    ),
    statCards,
    h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-head' }, h('div', {}, h('p', { class: 'eyebrow' }, '进度'), h('h2', {}, '四册完成度'))),
      bookRows,
    ),
    h(
      'section',
      { class: 'section' },
      h(
        'div',
        { class: 'section-head' },
        h('div', {}, h('p', { class: 'eyebrow' }, '最近七天'), h('h2', {}, '每日答题')),
        h('span', { class: 'muted' }, `错题 ${mistakeCount} 道`),
      ),
      h('div', { class: 'card chart-card' }, chart),
    ),
    h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-head' }, h('div', {}, h('p', { class: 'eyebrow' }, '继续'), h('h2', {}, '最近学习'))),
      recentList,
    ),
  );
}
