import { h, icon, debounce } from '../ui.js';

const SUGGESTIONS = ['handbag', 'private', '时态', 'puma', 'conversation'];

function lessonRange(item) {
  return item.lessonTo && item.lessonTo !== item.lessonFrom
    ? `Lesson ${item.lessonFrom}–${item.lessonTo}`
    : `Lesson ${item.lessonFrom}`;
}

export async function renderSearch(container, ctx) {
  const index = await ctx.ensureSearchIndex();
  let query = ctx.query.get('q') || '';
  let results = [];

  const input = h('input', {
    class: 'input search-input',
    type: 'search',
    placeholder: '搜索课文标题、单词、中文释义或短语…',
    value: query,
    'aria-label': '搜索课程',
  });
  const summary = h('p', { class: 'muted search-summary' }, '');
  const resultList = h('div', { class: 'search-results' });

  function search(value) {
    const needle = value.trim().toLowerCase();
    if (!needle) return [];
    const matches = [];
    for (const item of index) {
      let score = 0;
      const chips = [];
      if (item.title.toLowerCase().includes(needle)) {
        score += 8;
        chips.push(item.title);
      }
      if (item.titleZh && item.titleZh.toLowerCase().includes(needle)) {
        score += 6;
        chips.push(item.titleZh);
      }
      const words = item.words.filter((word) => word.toLowerCase().includes(needle)).slice(0, 3);
      if (words.length) {
        score += 5;
        chips.push(...words);
      }
      const meanings = item.meanings.filter((meaning) => meaning.includes(needle)).slice(0, 3);
      if (meanings.length) {
        score += 4;
        chips.push(...meanings);
      }
      const phrases = item.phrases.filter((phrase) => phrase.toLowerCase().includes(needle)).slice(0, 2);
      if (phrases.length) {
        score += 3;
        chips.push(...phrases);
      }
      if (score) matches.push({ item, score, chips: [...new Set(chips)].slice(0, 4) });
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, 50);
  }

  function renderResults() {
    resultList.replaceChildren();
    results = search(query);
    if (!query.trim()) {
      summary.textContent = '输入关键词开始搜索；也可以试试下面的例子。';
      resultList.appendChild(
        h(
          'div',
          { class: 'suggestion-box card' },
          h('h3', {}, '试试这些'),
          h(
            'div',
            { class: 'suggestion-chips' },
            SUGGESTIONS.map((suggestion) =>
              h(
                'button',
                {
                  type: 'button',
                  class: 'chip',
                  onclick: () => {
                    input.value = suggestion;
                    query = suggestion;
                    updateUrl();
                    renderResults();
                  },
                },
                suggestion,
              ),
            ),
          ),
        ),
      );
      return;
    }
    summary.textContent = results.length ? `找到 ${results.length} 个相关单元` : '没有找到匹配结果';
    if (!results.length) {
      resultList.appendChild(
        h(
          'div',
          { class: 'empty-state card' },
          h('span', { class: 'empty-icon' }, icon('search', 28)),
          h('h3', {}, '没有找到'),
          h('p', { class: 'muted' }, '试试更短的英文单词、中文释义，或只输入标题中的一个词。'),
        ),
      );
      return;
    }
    for (const { item, chips } of results) {
      const book = ctx.getBookMeta(item.book);
      resultList.appendChild(
        h(
          'a',
          { class: 'search-result', href: `#/lesson/${item.id}` },
          h(
            'div',
            { class: 'search-result-main' },
            h('p', { class: 'eyebrow' }, `第 ${item.book} 册 · ${book?.titleZh || ''} · ${lessonRange(item)}`),
            h('h3', {}, item.title),
            item.titleZh ? h('p', { class: 'muted' }, item.titleZh) : null,
            chips.length
              ? h('div', { class: 'search-chips' }, chips.map((chip) => h('span', { class: 'chip chip-static' }, chip)))
              : null,
          ),
          icon('chevron', 18),
        ),
      );
    }
  }

  function updateUrl() {
    const value = query.trim();
    window.history.replaceState(null, '', value ? `#/search?q=${encodeURIComponent(value)}` : '#/search');
  }

  const onInput = debounce(() => {
    query = input.value;
    updateUrl();
    renderResults();
  }, 220);
  input.addEventListener('input', onInput, { signal: ctx.signal });
  input.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        query = input.value;
        updateUrl();
        renderResults();
      }
    },
    { signal: ctx.signal },
  );

  container.append(
    h(
      'header',
      { class: 'page-head search-head' },
      h('p', { class: 'eyebrow' }, '检索'),
      h('h1', {}, '搜索课程'),
      h('p', { class: 'muted' }, '按标题、单词、中文释义或短语查找四册中的任意单元。'),
    ),
    h('div', { class: 'search-bar' }, icon('search', 20), input),
    summary,
    resultList,
  );

  renderResults();
  input.focus({ preventScroll: true });
}
