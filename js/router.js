/** hash 路由：兼容 GitHub Pages 子路径，刷新不 404。 */
export function parseLocation() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [pathname, queryString = ''] = raw.split('?');
  return {
    pathname: pathname || '/',
    query: new URLSearchParams(queryString),
    raw,
  };
}

export function navigate(to, { replace = false } = {}) {
  const target = to.startsWith('#') ? to : `#${to}`;
  if (replace) {
    const url = `${window.location.pathname}${window.location.search}${target}`;
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new Event('hashchange'));
  } else if (window.location.hash !== target) {
    window.location.hash = target;
  }
}

export function buildUrl(pathname, params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  }
  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function startRouter(handler) {
  const onHashChange = () => handler(parseLocation());
  window.addEventListener('hashchange', onHashChange);
  onHashChange();
  return () => window.removeEventListener('hashchange', onHashChange);
}
