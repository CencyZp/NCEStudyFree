import { store } from './store.js';
import { ProfileManager, profileInitial } from './profiles.js';
import { startRouter, parseLocation, navigate } from './router.js';
import {
  h,
  icon,
  clear,
  toast,
  scrollTop,
  openModal,
  promptDialog,
  confirmDialog,
} from './ui.js';
import { tts } from './tts.js';
import { recorder } from './recorder.js';
import { renderHome } from './views/home.js';
import { renderBook } from './views/book.js';
import { renderLesson } from './views/lesson.js';
import { renderReview } from './views/review.js';
import { renderStats } from './views/stats.js';
import { renderSettings } from './views/settings.js';
import { renderSearch } from './views/search.js';

const bookPromises = new Map();
let searchPromise = null;
let routeController = null;
let routeCleanup = null;
let profileManager = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`资源加载失败：${src}`));
    document.head.appendChild(script);
  });
}

export function ensureBookData(bookId) {
  const id = Number(bookId);
  if (window.NCE?.booksData?.[id]) return Promise.resolve(window.NCE.booksData[id]);
  if (!bookPromises.has(id)) {
    const promise = loadScript(`./data/book${id}.js`)
      .then(() => {
        const data = window.NCE?.booksData?.[id];
        if (!data) throw new Error(`第 ${id} 册数据为空`);
        return data;
      })
      .catch((error) => {
        bookPromises.delete(id);
        throw error;
      });
    bookPromises.set(id, promise);
  }
  return bookPromises.get(id);
}

export function ensureSearchIndex() {
  if (window.NCE?.searchIndex) return Promise.resolve(window.NCE.searchIndex);
  if (!searchPromise) {
    searchPromise = loadScript('./data/search-index.js')
      .then(() => {
        if (!window.NCE?.searchIndex) throw new Error('搜索索引为空');
        return window.NCE.searchIndex;
      })
      .catch((error) => {
        searchPromise = null;
        throw error;
      });
  }
  return searchPromise;
}

export function getBookMeta(bookId) {
  return window.NCE?.books?.find((book) => book.id === Number(bookId)) || null;
}

export function getUnit(bookId, unitId) {
  return window.NCE?.booksData?.[Number(bookId)]?.units?.find((unit) => unit.id === unitId) || null;
}

function applyTheme() {
  const pref = store.state.settings.theme || 'system';
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  const dark = pref === 'dark' || (pref === 'system' && systemDark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.font = store.state.settings.fontSize || 'md';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#111713' : '#f6f1e7');
}

function updateStreak() {
  const pill = document.getElementById('streak-pill');
  if (!pill) return;
  const current = store.state.streak?.current || 0;
  pill.classList.toggle('is-empty', current <= 0);
  pill.querySelector('[data-streak-value]')?.replaceChildren(document.createTextNode(String(current)));
}

function updateProfileChip() {
  const chip = document.getElementById('profile-chip');
  if (!chip) return;
  const profile = profileManager?.active();
  const name = profile?.name || '我的学习';
  const avatar = chip.querySelector('.profile-avatar');
  const label = chip.querySelector('.profile-name');
  if (avatar) {
    avatar.textContent = profileInitial(name);
    avatar.style.setProperty('--profile-color', profile?.color || '#14532d');
  }
  if (label) label.textContent = name;
  chip.setAttribute('aria-label', `当前档案：${name}，点击切换`);
  chip.setAttribute('title', `当前档案：${name}`);
}

function openProfileSwitcher() {
  if (!profileManager) return;
  const listHost = h('div', { class: 'profile-list' });

  const render = () => {
    clear(listHost);
    const profiles = profileManager.list();
    for (const profile of profiles) {
      const active = profile.id === profileManager.activeId;
      listHost.appendChild(
        h(
          'div',
          { class: `profile-row ${active ? 'is-active' : ''}` },
          h(
            'span',
            { class: 'profile-avatar', style: { '--profile-color': profile.color } },
            profileInitial(profile.name),
          ),
          h(
            'div',
            { class: 'profile-row-main' },
            h('strong', {}, profile.name),
            h('span', { class: 'muted' }, active ? '当前档案 · 独立进度' : '独立进度、生词与笔记'),
          ),
          h(
            'div',
            { class: 'profile-row-actions' },
            active
              ? h('span', { class: 'badge' }, '当前')
              : h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn btn-ghost btn-sm',
                    onclick: () => {
                      profileManager.switch(profile.id);
                      window.location.reload();
                    },
                  },
                  '切换',
                ),
            h(
              'button',
              {
                type: 'button',
                class: 'icon-btn',
                'aria-label': `重命名 ${profile.name}`,
                title: '重命名',
                onclick: async () => {
                  const name = await promptDialog({
                    title: '重命名档案',
                    label: '档案名称',
                    value: profile.name,
                    confirmText: '保存',
                  });
                  if (!name) return;
                  try {
                    profileManager.rename(profile.id, name);
                    updateProfileChip();
                    render();
                    toast('档案已重命名', 'success');
                  } catch (error) {
                    toast(error.message, 'error');
                  }
                },
              },
              icon('note', 16),
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'icon-btn',
                'aria-label': `删除 ${profile.name}`,
                title: '删除',
                disabled: profiles.length <= 1,
                onclick: async () => {
                  const ok = await confirmDialog(
                    `删除“${profile.name}”会永久删除该档案的进度、生词、错题和笔记。`,
                    { title: '删除档案', confirmText: '删除', danger: true },
                  );
                  if (!ok) return;
                  try {
                    profileManager.remove(profile.id);
                    window.location.reload();
                  } catch (error) {
                    toast(error.message, 'error');
                  }
                },
              },
              icon('trash', 16),
            ),
          ),
        ),
      );
    }
  };
  render();

  const body = h(
    'div',
    { class: 'profile-manager' },
    h('p', { class: 'muted' }, '每个档案独立保存进度、生词、错题和笔记；切换不会丢失数据。'),
    listHost,
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-primary profile-create',
        onclick: async () => {
          const name = await promptDialog({
            title: '新建学习档案',
            label: '档案名称',
            placeholder: '例如：小明',
            confirmText: '创建',
          });
          if (!name) return;
          try {
            const profile = profileManager.create(name);
            profileManager.switch(profile.id);
            window.location.reload();
          } catch (error) {
            toast(error.message, 'error');
          }
        },
      },
      icon('user', 16),
      '新建档案',
    ),
  );

  openModal({ title: '学习档案', body, actions: [{ label: '关闭', kind: 'ghost' }] });
}

const NAV_ITEMS = [
  { path: '/', label: '首页', icon: 'home', match: ['/'] },
  { path: '/book/1', label: '课程', icon: 'book', match: ['/book', '/lesson'] },
  { path: '/review', label: '复习', icon: 'layers', match: ['/review'] },
  { path: '/stats', label: '统计', icon: 'chart', match: ['/stats'] },
  { path: '/settings', label: '设置', icon: 'settings', match: ['/settings'] },
];

function navLink(item) {
  return h(
    'a',
    { class: 'nav-link', href: `#${item.path}`, 'data-nav': item.match[0], 'aria-label': item.label },
    icon(item.icon, 18),
    h('span', {}, item.label),
  );
}

function buildShell() {
  const app = document.getElementById('app');
  clear(app);

  const brand = h(
    'a',
    { class: 'brand', href: '#/', 'aria-label': 'NCE StudyFree 首页' },
    h('span', { class: 'brand-mark' }, 'NCE'),
    h(
      'span',
      { class: 'brand-text' },
      h('strong', {}, 'StudyFree'),
      h('small', {}, '新概念英语 1–4'),
    ),
  );

  const activeProfile = profileManager?.active();
  const profileButton = h(
    'button',
    {
      type: 'button',
      class: 'profile-chip',
      id: 'profile-chip',
      title: `当前档案：${activeProfile?.name || '我的学习'}`,
      'aria-label': `当前档案：${activeProfile?.name || '我的学习'}，点击切换`,
      onclick: () => openProfileSwitcher(),
    },
    h(
      'span',
      { class: 'profile-avatar', style: { '--profile-color': activeProfile?.color || '#14532d' } },
      profileInitial(activeProfile?.name || '我的学习'),
    ),
    h('span', { class: 'profile-name' }, activeProfile?.name || '我的学习'),
  );

  const header = h(
    'header',
    { class: 'app-header' },
    h(
      'div',
      { class: 'header-inner' },
      brand,
      h('nav', { class: 'nav', 'aria-label': '主导航' }, NAV_ITEMS.slice(0, 4).map(navLink)),
      h(
        'div',
        { class: 'header-actions' },
        profileButton,
        h(
          'span',
          { class: 'streak-pill', id: 'streak-pill', title: '连续学习天数' },
          icon('clock', 15),
          h('span', { 'data-streak-value': '' }, '0'),
          h('span', {}, '天'),
        ),
        h('a', { class: 'icon-btn search-link', href: '#/search', 'aria-label': '搜索课程' }, icon('search', 19)),
        navLink({ path: '/settings', label: '设置', icon: 'settings', match: ['/settings'] }),
      ),
    ),
  );

  const main = h('main', { class: 'main', id: 'main', tabindex: '-1' }, h('div', { class: 'view', id: 'view' }));

  const footer = h(
    'footer',
    { class: 'site-footer' },
    h(
      'div',
      { class: 'footer-inner' },
      h('p', {}, h('strong', {}, 'NCE StudyFree'), ' · 新概念英语 1–4 本地学习站'),
      h(
        'p',
        { class: 'muted' },
        '学习进度只保存在当前浏览器；课文与译文版权归原作者及出版社，仅供个人学习。',
      ),
      h('p', {}, h('a', { href: '#/settings' }, '数据来源与版权说明')),
    ),
  );

  const bottomNav = h(
    'nav',
    { class: 'bottom-nav', 'aria-label': '移动端导航' },
    NAV_ITEMS.filter((item) => ['/', '/book/1', '/review', '/stats', '/settings'].includes(item.path)).map((item) =>
      h(
        'a',
        { class: 'bottom-link', href: `#${item.path}`, 'data-nav': item.match[0] },
        icon(item.icon, 20),
        h('span', {}, item.label),
      ),
    ),
  );

  app.append(header, main, footer, bottomNav);

  // #main 会被 hash 路由解析成 /main，这里拦截并直接聚焦主内容
  document.querySelector('.skip-link')?.addEventListener('click', (event) => {
    event.preventDefault();
    main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: true });
    main.scrollIntoView({ behavior: 'auto', block: 'start' });
  });
}

function updateNav(pathname) {
  let active = '';
  if (pathname === '/') active = '/';
  else if (pathname.startsWith('/book') || pathname.startsWith('/lesson')) active = '/book';
  else if (pathname.startsWith('/review')) active = '/review';
  else if (pathname.startsWith('/stats')) active = '/stats';
  else if (pathname.startsWith('/settings')) active = '/settings';
  document.querySelectorAll('[data-nav]').forEach((element) => {
    const isActive = element.dataset.nav === active;
    element.classList.toggle('is-active', isActive);
    if (isActive) element.setAttribute('aria-current', 'page');
    else element.removeAttribute('aria-current');
  });
}

function loadingView() {
  return h(
    'div',
    { class: 'loading-card' },
    h('span', { class: 'spinner', 'aria-hidden': 'true' }),
    h('p', {}, '正在加载课程…'),
  );
}

function errorView(error, retry) {
  return h(
    'section',
    { class: 'empty-state card' },
    h('span', { class: 'empty-icon' }, icon('search', 28)),
    h('h2', {}, '页面加载失败'),
    h('p', { class: 'muted' }, error?.message || '未知错误'),
    h(
      'div',
      { class: 'empty-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: retry }, '重试'),
      h('a', { class: 'btn btn-ghost', href: '#/' }, '回到首页'),
    ),
    h('details', { class: 'error-detail' }, h('summary', {}, '技术细节'), h('pre', {}, String(error?.stack || error))),
  );
}

function notFoundView() {
  return h(
    'section',
    { class: 'empty-state card' },
    h('span', { class: 'empty-icon' }, icon('book', 30)),
    h('h2', {}, '没有找到这个页面'),
    h('p', { class: 'muted' }, '链接可能已过期，或者课号不存在。'),
    h(
      'div',
      { class: 'empty-actions' },
      h('a', { class: 'btn btn-primary', href: '#/' }, '回到首页'),
      h('a', { class: 'btn btn-ghost', href: '#/book/1' }, '浏览第一册'),
    ),
  );
}

function makeContext(location, signal) {
  return {
    store,
    navigate,
    signal,
    query: location.query,
    pathname: location.pathname,
    ensureBookData,
    ensureSearchIndex,
    getBookMeta,
    getUnit,
    toast,
    tts,
    recorder,
    profileManager,
    openProfileSwitcher,
    updateProfileChip,
  };
}

async function handleRoute(location) {
  routeController?.abort();
  const controller = new AbortController();
  routeController = controller;
  const { signal } = controller;

  if (routeCleanup) {
    try {
      routeCleanup();
    } catch {
      /* 忽略清理错误 */
    }
    routeCleanup = null;
  }

  const view = document.getElementById('view');
  if (!view) return;
  clear(view);
  const container = h('div', { class: 'route' });
  view.appendChild(loadingView());
  updateNav(location.pathname);

  try {
    const ctx = makeContext(location, signal);
    const { pathname } = location;
    let cleanup = null;

    if (pathname === '/' || pathname === '') {
      cleanup = await renderHome(container, ctx);
    } else if (pathname === '/review') {
      cleanup = await renderReview(container, ctx);
    } else if (pathname === '/stats') {
      cleanup = await renderStats(container, ctx);
    } else if (pathname === '/settings') {
      cleanup = await renderSettings(container, ctx);
    } else if (pathname === '/search') {
      cleanup = await renderSearch(container, ctx);
    } else {
      const bookMatch = pathname.match(/^\/book\/([1-4])$/);
      const lessonMatch = pathname.match(/^\/lesson\/(b([1-4])-u\d{2})$/);
      if (bookMatch) {
        cleanup = await renderBook(container, ctx, Number(bookMatch[1]));
      } else if (lessonMatch) {
        cleanup = await renderLesson(container, ctx, Number(lessonMatch[2]), lessonMatch[1]);
      } else {
        container.appendChild(notFoundView());
      }
    }

    if (signal.aborted) {
      if (typeof cleanup === 'function') cleanup();
      return;
    }

    clear(view);
    view.appendChild(container);
    routeCleanup = typeof cleanup === 'function' ? cleanup : null;
    document.getElementById('main')?.focus({ preventScroll: true });
  } catch (error) {
    if (signal.aborted) return;
    console.error(error);
    clear(view);
    view.appendChild(errorView(error, () => handleRoute(parseLocation())));
  }
  if (!signal.aborted) scrollTop();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.location.protocol.startsWith('http')) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service worker 注册失败', error);
    });
  });
}

function init() {
  if (!window.NCE?.books?.length) {
    const view = document.getElementById('view') || document.getElementById('app');
    if (view) {
      clear(view);
      view.appendChild(
        errorView(
          new Error('课程元数据未加载。请确认 data/books.js 存在，并通过本地服务器打开（node tools/serve.mjs）。'),
          () => window.location.reload(),
        ),
      );
    }
    return;
  }

  store.onError = () => {
    toast('浏览器本地存储不可用，学习进度可能无法保存。建议在设置中导出备份。', 'error', 8000);
  };
  store.load();
  profileManager = new ProfileManager({ store });
  profileManager.load();
  store.watchExternalChanges();
  profileManager.watchExternalChanges();
  applyTheme();
  buildShell();
  profileManager.subscribe(updateProfileChip);
  updateProfileChip();
  updateStreak();

  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener?.('change', () => {
    if ((store.state.settings.theme || 'system') === 'system') applyTheme();
  });

  store.subscribe(() => {
    applyTheme();
    updateStreak();
    updateNav(parseLocation().pathname);
  });

  window.addEventListener('beforeunload', () => store.save(true));
  startRouter(handleRoute);
  registerServiceWorker();

  window.NCE_APP = {
    store,
    profileManager,
    navigate,
    ensureBookData,
    ensureSearchIndex,
    getBookMeta,
    getUnit,
    openProfileSwitcher,
  };
}

init();
