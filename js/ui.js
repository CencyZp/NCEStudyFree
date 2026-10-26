/** 轻量 DOM、图标、Toast 与弹窗工具。 */

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3v-4h.09A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 8.94 4.6 1.7 1.7 0 0 0 10 3.04V3h4v.09A1.7 1.7 0 0 0 15.06 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 7l-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.96 10H21v4h-.09A1.7 1.7 0 0 0 19.4 15z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14"/><path d="M16 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15 9a4 4 0 0 1 0 6"/><path d="M18 6a8 8 0 0 1 0 12"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 19v3"/><path d="M8 22h8"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  close: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 21h16"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 7 7 0 1 0 20 14.5z"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4z"/><path d="M20 14h-2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2z"/>',
  note: '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h5"/><path d="M8 12h8M8 16h6"/>',
};

export function icon(name, size = 20, className = '') {
  const span = document.createElement('span');
  span.className = `icon ${className}`.trim();
  span.style.width = `${size}px`;
  span.style.height = `${size}px`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

function appendChildren(element, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      appendChildren(element, child);
    } else if (child instanceof Node) {
      element.appendChild(child);
    } else {
      element.appendChild(document.createTextNode(String(child)));
    }
  }
}

export function h(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class' || key === 'className') {
      element.className = value;
    } else if (key === 'text') {
      element.textContent = value;
    } else if (key === 'html') {
      element.innerHTML = value;
    } else if (key === 'dataset') {
      Object.assign(element.dataset, value);
    } else if (key === 'style' && typeof value === 'object') {
      for (const [property, propertyValue] of Object.entries(value)) {
        if (propertyValue === null || propertyValue === undefined) continue;
        if (property.startsWith('--')) element.style.setProperty(property, propertyValue);
        else element.style[property] = propertyValue;
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'value') {
      element.value = value;
    } else if (['checked', 'disabled', 'selected', 'hidden'].includes(key)) {
      element[key] = Boolean(value);
    } else {
      element.setAttribute(key, value);
    }
  }
  appendChildren(element, children);
  return element;
}

export function clear(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
  return element;
}

export function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

export function qsa(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

export function debounce(fn, delay = 250) {
  let timer;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  wrapped.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

export function toast(message, type = 'info', duration = 2800) {
  const root = document.getElementById('toast-root') || document.body;
  const element = h('div', { class: `toast toast-${type}`, role: 'status' }, message);
  root.appendChild(element);
  requestAnimationFrame(() => element.classList.add('show'));
  setTimeout(() => {
    element.classList.remove('show');
    setTimeout(() => element.remove(), 260);
  }, duration);
}

export function openModal({ title, body, actions = [], onClose = null, className = '' }) {
  const root = document.getElementById('modal-root') || document.body;
  const appRoot = document.getElementById('app');
  const previousFocus = document.activeElement;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    appRoot?.removeAttribute('inert');
    previousFocus?.focus?.();
    onClose?.();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') {
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = [...overlay.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((element) => element.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const footer = actions.length
    ? h(
        'div',
        { class: 'modal-actions' },
        actions.map((action) =>
          h(
            'button',
            {
              type: 'button',
              class: `btn ${action.kind ? `btn-${action.kind}` : 'btn-ghost'}`,
              onclick: () => {
                const shouldClose = action.onClick ? action.onClick() : true;
                if (shouldClose !== false) close();
              },
            },
            action.label,
          ),
        ),
      )
    : null;
  const overlay = h(
    'div',
    {
      class: 'modal-overlay',
      onclick: (event) => {
        if (event.target === overlay) close();
      },
    },
    h(
      'div',
      { class: `modal ${className}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h(
        'div',
        { class: 'modal-head' },
        h('h2', { class: 'modal-title' }, title),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': '关闭', onclick: close }, icon('close', 18)),
      ),
      h('div', { class: 'modal-body' }, typeof body === 'string' ? h('p', {}, body) : body),
      footer,
    ),
  );
  appRoot?.setAttribute('inert', '');
  root.appendChild(overlay);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => {
    overlay.classList.add('show');
    (overlay.querySelector('.modal-actions button') || overlay.querySelector('button, input, textarea, select'))?.focus?.();
  });
  return close;
}

export function confirmDialog(message, { title = '请确认', confirmText = '确定', danger = false } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const close = openModal({
      title,
      body: h('p', { class: 'modal-message' }, message),
      actions: [
        { label: '取消', kind: 'ghost', onClick: () => { settled = true; resolve(false); } },
        {
          label: confirmText,
          kind: danger ? 'danger' : 'primary',
          onClick: () => { settled = true; resolve(true); },
        },
      ],
      onClose: () => {
        if (!settled) resolve(false);
      },
    });
    void close;
  });
}

export function formatPercent(value) {
  const number = Number(value) || 0;
  return `${Math.round(number * 100)}%`;
}

export function formatMinutes(seconds) {
  const minutes = Math.round((Number(seconds) || 0) / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

export function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export function formatShortDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}
