import { h, icon, formatPercent } from '../ui.js';

const STATUS_LABELS = {
  new: '未学',
  learning: '学习中',
  done: '已完成',
};

function lessonLabel(unit) {
  return unit.lessonTo && unit.lessonTo !== unit.lessonFrom
    ? `Lesson ${unit.lessonFrom}–${unit.lessonTo}`
    : `Lesson ${unit.lessonFrom}`;
}

function matchesQuery(unit, query) {
  if (!query) return true;
  if (unit.title.toLowerCase().includes(query)) return true;
  if (unit.titleZh && unit.titleZh.toLowerCase().includes(query)) return true;
  if (unit.vocab.some((word) => word.word.toLowerCase().includes(query))) return true;
  if (unit.vocab.some((word) => word.meanings.some((meaning) => meaning.meaning.includes(query)))) return true;
  if (unit.phrases.some((phrase) => phrase.phrase.toLowerCase().includes(query))) return true;
  return false;
}

function unitRow(unit, store) {
  const progress = store.getProgress(unit.id);
  const status = progress.status || 'new';
  const score = progress.bestScore ? `正确率 ${formatPercent(progress.bestScore)}` : '';
  return h(
    'a',
    { class: 'unit-row', href: `#/lesson/${unit.id}`, 'data-status': status },
    h(
      'span',
      { class: 'unit-index' },
      h('strong', {}, String(unit.lessonFrom).padStart(2, '0')),
      unit.lessonTo !== unit.lessonFrom ? h('small', {}, `–${String(unit.lessonTo).padStart(2, '0')}`) : null,
    ),
    h(
      'div',
      { class: 'unit-main' },
      h('h3', { class: 'unit-title' }, unit.title),
      h(
        'p',
        { class: 'unit-sub' },
        unit.titleZh || lessonLabel(unit),
        h('span', { class: 'dot' }, '·'),
        `${unit.sentences.length} 句`,
        h('span', { class: 'dot' }, '·'),
        `${unit.vocab.length} 词`,
      ),
    ),
    h(
      'div',
      { class: 'unit-side' },
      score ? h('span', { class: 'unit-score' }, score) : null,
      h('span', { class: `status-badge status-${status}` }, STATUS_LABELS[status] || status),
      store.isFavorite(unit.id) ? h('span', { class: 'favorite-mark', title: '已收藏' }, icon('star', 15)) : null,
      h('span', { class: 'unit-arrow' }, icon('chevron', 17)),
    ),
  );
}

export async function renderBook(container, ctx, bookId) {
  const { store } = ctx;
  const book = ctx.getBookMeta(bookId);
  if (!book) {
    container.appendChild(
      h(
        'section',
        { class: 'empty-state card' },
        h('h2', {}, '没有找到这本教材'),
        h('a', { class: 'btn btn-primary', href: '#/' }, '回到首页'),
      ),
    );
    return;
  }

  await ctx.ensureBookData(bookId);
  const data = window.NCE.booksData[bookId];
  const units = data?.units || [];
  if (!units.length) throw new Error('课程数据为空');

  const progressById = store.state.progress;
  const done = units.filter((unit) => progressById[unit.id]?.status === 'done').length;
  const learning = units.filter((unit) => progressById[unit.id]?.status === 'learning').length;
  const percent = units.length ? done / units.length : 0;
  const resume =
    [...units].reverse().find((unit) => progressById[unit.id]?.lastVisit) ||
    units.find((unit) => progressById[unit.id]?.status !== 'done') ||
    units[0];

  const header = h(
    'section',
    { class: 'book-hero', style: { '--book-color': book.color } },
    h('a', { class: 'back-link', href: '#/' }, icon('back', 16), '全部教材'),
    h(
      'div',
      { class: 'book-hero-main' },
      h(
        'div',
        { class: 'book-hero-copy' },
        h('p', { class: 'eyebrow' }, `第 ${book.id} 册 · ${book.level}`),
        h('h1', {}, book.title),
        h('p', { class: 'book-hero-zh' }, book.titleZh),
        h('p', { class: 'book-hero-desc' }, book.description),
        h(
          'div',
          { class: 'book-hero-stats' },
          h('span', {}, `${book.units} 个学习单元`),
          h('span', {}, `${book.lessons} 课`),
          h('span', {}, `${book.sentences} 句课文`),
          h('span', {}, `${book.vocab} 个词条`),
        ),
        h(
          'div',
          { class: 'book-hero-actions' },
          h('a', { class: 'btn btn-primary', href: `#/lesson/${resume.id}` }, `继续 ${lessonLabel(resume)}`, icon('chevron', 17)),
          done > 0 ? h('span', { class: 'muted' }, `已完成 ${done} / ${units.length}`) : null,
        ),
      ),
      h(
        'div',
        { class: 'book-progress-panel' },
        h('div', { class: 'progress-ring', style: { '--percent': `${Math.round(percent * 100)}%` } }, h('strong', {}, formatPercent(percent))),
        h('p', {}, '本册完成度'),
        h('p', { class: 'muted' }, `${done} 已完成 · ${learning} 学习中`),
      ),
    ),
  );

  const filterInput = h('input', {
    class: 'input',
    type: 'search',
    placeholder: '搜索课文标题、单词或中文释义…',
    'aria-label': '搜索本册课程',
  });
  const statusSelect = h(
    'select',
    { class: 'select', 'aria-label': '按学习状态筛选' },
    h('option', { value: 'all' }, '全部状态'),
    h('option', { value: 'new' }, '未学'),
    h('option', { value: 'learning' }, '学习中'),
    h('option', { value: 'done' }, '已完成'),
  );
  const countLabel = h('span', { class: 'muted' }, '');
  const list = h('div', { class: 'unit-list' });

  let query = '';
  let statusFilter = 'all';

  const renderList = () => {
    list.replaceChildren();
    const filtered = units.filter((unit) => {
      const progress = store.getProgress(unit.id);
      if (statusFilter !== 'all' && progress.status !== statusFilter) return false;
      return matchesQuery(unit, query);
    });
    countLabel.textContent = `显示 ${filtered.length} / ${units.length} 个单元`;
    if (!filtered.length) {
      list.appendChild(
        h(
          'div',
          { class: 'empty-state card' },
          h('span', { class: 'empty-icon' }, icon('search', 26)),
          h('h3', {}, '没有匹配的课程'),
          h('p', { class: 'muted' }, '试试更短的关键词，或切换学习状态。'),
        ),
      );
      return;
    }

    const groups = new Map();
    for (const unit of filtered) {
      const groupIndex = Math.floor((unit.unit - 1) / 12);
      if (!groups.has(groupIndex)) groups.set(groupIndex, []);
      groups.get(groupIndex).push(unit);
    }
    for (const [groupIndex, groupUnits] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
      const first = groupUnits[0];
      const last = groupUnits[groupUnits.length - 1];
      list.appendChild(
        h(
          'section',
          { class: 'unit-group' },
          h(
            'div',
            { class: 'unit-group-head' },
            h('h2', {}, `Lesson ${first.lessonFrom}–${last.lessonTo}`),
            h('span', { class: 'muted' }, `${groupUnits.length} 个单元`),
          ),
          h('div', { class: 'unit-group-body' }, groupUnits.map((unit) => unitRow(unit, store))),
        ),
      );
    }
  };

  filterInput.addEventListener(
    'input',
    () => {
      query = filterInput.value.trim().toLowerCase();
      renderList();
    },
    { signal: ctx.signal },
  );
  statusSelect.addEventListener(
    'change',
    () => {
      statusFilter = statusSelect.value;
      renderList();
    },
    { signal: ctx.signal },
  );

  container.append(
    header,
    h(
      'section',
      { class: 'section book-lessons' },
      h(
        'div',
        { class: 'section-head' },
        h('div', {}, h('p', { class: 'eyebrow' }, '课程'), h('h2', {}, '选择一课开始')),
        countLabel,
      ),
      h('div', { class: 'filter-bar' }, filterInput, statusSelect),
      list,
    ),
  );

  renderList();
}
