import { h, icon, formatMinutes, formatPercent } from '../ui.js';
import { dayKey } from '../store.js';

function bookProgress(store, book) {
  const prefix = `b${book.id}-`;
  const entries = Object.entries(store.state.progress).filter(([id]) => id.startsWith(prefix));
  const done = entries.filter(([, progress]) => progress.status === 'done').length;
  return { done, total: book.units, percent: book.units ? done / book.units : 0 };
}

function bookCard(store, book) {
  const progress = bookProgress(store, book);
  return h(
    'a',
    {
      class: 'book-card',
      href: `#/book/${book.id}`,
      style: { '--book-color': book.color },
      'aria-label': `${book.titleZh} ${book.title}，已完成 ${progress.done} / ${progress.total}`,
    },
    h(
      'div',
      { class: 'book-card-top' },
      h('span', { class: 'book-level' }, book.level),
      h('span', { class: 'book-units' }, `${book.units} 个单元`),
    ),
    h('h3', { class: 'book-title' }, book.title),
    h('p', { class: 'book-title-zh' }, book.titleZh),
    h('p', { class: 'book-desc' }, book.description),
    h(
      'div',
      { class: 'book-progress' },
      h('div', { class: 'progress-track' }, h('span', { style: { width: `${Math.round(progress.percent * 100)}%` } })),
      h('span', { class: 'book-progress-label' }, `${progress.done} / ${progress.total}`),
    ),
    h(
      'div',
      { class: 'book-card-foot' },
      h('span', {}, progress.done ? `已完成 ${formatPercent(progress.percent)}` : '尚未开始'),
      h('span', { class: 'book-card-arrow' }, icon('chevron', 18)),
    ),
  );
}

export async function renderHome(container, ctx) {
  const { store } = ctx;
  const books = window.NCE.books;
  const totalUnits = books.reduce((sum, book) => sum + book.units, 0);
  const progressEntries = Object.values(store.state.progress);
  const doneCount = progressEntries.filter((progress) => progress.status === 'done').length;
  const learningCount = progressEntries.filter((progress) => progress.status === 'learning').length;
  const streak = store.state.streak?.current || 0;
  const dueCards = store.dueSrs();
  const today = store.state.daily?.[dayKey()] || { seconds: 0, answered: 0, correct: 0 };
  const lastMeta = store.state.lastLessonMeta;
  const continueHref = lastMeta?.id ? `#/lesson/${lastMeta.id}` : '#/book/1';
  const continueTitle = lastMeta?.title || '从第一册第 1 课开始';
  const continueSub = lastMeta
    ? `第 ${lastMeta.book} 册 · Lesson ${lastMeta.lessonFrom}${lastMeta.lessonTo !== lastMeta.lessonFrom ? `–${lastMeta.lessonTo}` : ''}`
    : '第一册 · Lesson 1–2';

  const hero = h(
    'section',
    { class: 'hero' },
    h(
      'div',
      { class: 'hero-copy' },
      h('p', { class: 'eyebrow' }, 'NCE 1–4 · 276 个学习单元'),
      h('h1', {}, '把新概念四册，', h('br'), '变成每天的学习路径。'),
      h(
        'p',
        { class: 'hero-sub' },
        '逐句点读、中英对照、词汇与语法、自动生成的练习，以及只属于你的本地学习进度。',
      ),
      h(
        'div',
        { class: 'hero-actions' },
        h('a', { class: 'btn btn-primary btn-lg', href: continueHref }, '继续学习', icon('chevron', 18)),
        h('a', { class: 'btn btn-ghost btn-lg', href: '#/review' }, '开始复习', dueCards.length ? `（${dueCards.length}）` : ''),
      ),
      h(
        'p',
        { class: 'hero-note' },
        icon('clock', 14),
        '不需要注册，进度保存在当前浏览器。',
      ),
    ),
    h(
      'div',
      { class: 'hero-panel' },
      h('p', { class: 'panel-eyebrow' }, '继续上次的学习'),
      h('h3', {}, continueTitle),
      h('p', { class: 'muted' }, continueSub),
      h(
        'div',
        { class: 'hero-panel-foot' },
        h('a', { class: 'btn btn-light', href: continueHref }, '进入课程', icon('chevron', 16)),
        h('span', { class: 'hero-panel-meta' }, `${doneCount}/${totalUnits} 已完成`),
      ),
      h('div', { class: 'hero-decoration', 'aria-hidden': 'true' }, 'Aa'),
    ),
  );

  const stats = h(
    'section',
    { class: 'stat-strip', 'aria-label': '学习概览' },
    h(
      'div',
      { class: 'stat-card' },
      h('span', { class: 'stat-icon' }, icon('check', 18)),
      h('div', {}, h('strong', {}, String(doneCount)), h('span', {}, ` / ${totalUnits} 单元完成`)),
    ),
    h(
      'div',
      { class: 'stat-card' },
      h('span', { class: 'stat-icon' }, icon('clock', 18)),
      h('div', {}, h('strong', {}, String(streak)), h('span', {}, ' 天连续学习')),
    ),
    h(
      'div',
      { class: 'stat-card' },
      h('span', { class: 'stat-icon' }, icon('layers', 18)),
      h('div', {}, h('strong', {}, String(dueCards.length)), h('span', {}, ' 张生词待复习')),
    ),
    h(
      'div',
      { class: 'stat-card' },
      h('span', { class: 'stat-icon' }, icon('book', 18)),
      h('div', {}, h('strong', {}, String(learningCount)), h('span', {}, ' 个单元学习中')),
    ),
  );

  const bookGrid = h('div', { class: 'book-grid' }, books.map((book) => bookCard(store, book)));

  const todayCard = h(
    'section',
    { class: 'card today-card' },
    h('div', { class: 'card-head' }, h('h2', {}, '今天'), h('span', { class: 'muted' }, dayKey())),
    today.answered
      ? h(
          'div',
          { class: 'today-stats' },
          h('div', {}, h('strong', {}, String(today.answered)), h('span', {}, ' 题')),
          h('div', {}, h('strong', {}, `${today.correct || 0}`), h('span', {}, ' 题正确')),
          h('div', {}, h('strong', {}, formatMinutes(today.seconds || 0)), h('span', {}, ' 学习')),
        )
      : h(
          'div',
          { class: 'today-empty' },
          h('p', {}, '今天还没有开始。选一课，读 5 分钟也算进步。'),
          h('a', { class: 'btn btn-ghost', href: continueHref }, '现在开始', icon('chevron', 16)),
        ),
  );

  const reviewCard = h(
    'section',
    { class: 'card review-teaser' },
    h('div', { class: 'card-head' }, h('h2', {}, '复习'), h('span', { class: 'badge' }, `${dueCards.length} 待复习`)),
    h(
      'p',
      { class: 'muted' },
      dueCards.length
        ? '按间隔重复复习到期生词，趁记忆还清晰时再见面。'
        : '还没有到期的生词卡。把课文里的新词加入生词本，系统会按间隔安排复习。',
    ),
    h(
      'div',
      { class: 'teaser-actions' },
      h('a', { class: 'btn btn-primary', href: '#/review' }, '打开复习'),
      h('a', { class: 'btn btn-ghost', href: '#/search' }, '搜索课程'),
    ),
  );

  container.append(
    hero,
    stats,
    h(
      'section',
      { class: 'section' },
      h(
        'div',
        { class: 'section-head' },
        h('div', {}, h('p', { class: 'eyebrow' }, '教材'), h('h2', {}, '四册，一条循序渐进的路')),
        h('a', { class: 'text-link', href: '#/book/1' }, '浏览全部课程', icon('chevron', 16)),
      ),
      bookGrid,
    ),
    h('section', { class: 'home-columns' }, todayCard, reviewCard),
    h(
      'p',
      { class: 'source-note' },
      '课文与译文来自公开学习资料，版权归原作者及出版社；词汇和语法为 AI 辅助整理，仅供个人学习参考。',
    ),
  );
}
