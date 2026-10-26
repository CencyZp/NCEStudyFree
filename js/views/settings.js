import { store, dayKey } from '../store.js';
import { h, icon, toast, confirmDialog } from '../ui.js';

const THEMES = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];
const FONT_SIZES = [
  { value: 'sm', label: '小' },
  { value: 'md', label: '标准' },
  { value: 'lg', label: '大' },
];

function settingsCard(iconName, title, description, body) {
  return h(
    'section',
    { class: 'settings-card card' },
    h(
      'div',
      { class: 'settings-card-head' },
      h('span', { class: 'settings-icon' }, icon(iconName, 20)),
      h('div', {}, h('h2', {}, title), description ? h('p', { class: 'muted' }, description) : null),
    ),
    body,
  );
}

function segmented(options, current, onChange) {
  const buttons = options.map((option) =>
    h(
      'button',
      {
        type: 'button',
        class: `segment ${option.value === current ? 'is-active' : ''}`,
        'aria-pressed': String(option.value === current),
        onclick: () => {
          onChange(option.value);
          buttons.forEach((button, index) => {
            const active = options[index].value === option.value;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
          });
        },
      },
      option.label,
    ),
  );
  return h('div', { class: 'segmented' }, buttons);
}

export async function renderSettings(container, ctx) {
  const settings = store.getSettings();
  const voices = ctx.tts.getVoices();
  const storageKb = (store.storageBytes() / 1024).toFixed(1);

  const themeControl = segmented(THEMES, settings.theme, (value) => {
    store.updateSettings({ theme: value });
    toast('主题已更新', 'success');
  });
  const fontControl = segmented(FONT_SIZES, settings.fontSize, (value) => {
    store.updateSettings({ fontSize: value });
  });

  const rateSelect = h(
    'select',
    {
      class: 'select',
      onchange: (event) => store.updateSettings({ ttsRate: Number(event.target.value) }),
    },
    [0.6, 0.75, 0.9, 1, 1.15, 1.3].map((rate) =>
      h('option', { value: String(rate), selected: Math.abs(rate - settings.ttsRate) < 0.01 }, `${rate.toFixed(2)}×`),
    ),
  );

  const voiceSelect = h('select', {
    class: 'select',
    onchange: (event) => store.updateSettings({ ttsVoice: event.target.value }),
  });
  function fillVoices() {
    const list = ctx.tts.getVoices();
    voiceSelect.replaceChildren(h('option', { value: '' }, list.length ? '系统默认' : '暂无英语语音'));
    for (const voice of list) {
      voiceSelect.appendChild(h('option', { value: voice.name }, `${voice.name} (${voice.lang})`));
    }
    voiceSelect.value = list.some((voice) => voice.name === store.getSettings().ttsVoice)
      ? store.getSettings().ttsVoice
      : '';
    voiceSelect.disabled = !list.length;
  }
  fillVoices();
  const unsubscribeVoices = ctx.tts.subscribe(fillVoices);

  const testVoice = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-ghost',
      onclick: () => {
        const current = store.getSettings();
        ctx.tts.speak('This is a sample sentence from New Concept English.', {
          rate: current.ttsRate,
          voiceName: current.ttsVoice,
          onError: () => toast('语音朗读不可用，请检查系统语音包', 'error'),
        });
      },
    },
    icon('volume', 16),
    '试听',
  );

  const showZhToggle = h(
    'label',
    { class: 'switch-row' },
    h('span', {}, '默认显示中文翻译'),
    h('input', {
      type: 'checkbox',
      checked: settings.showZh,
      onchange: (event) => store.updateSettings({ showZh: event.target.checked }),
    }),
  );

  const exportButton = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary',
      onclick: () => {
        const blob = new Blob([store.exportData()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = h('a', { href: url, download: `nce-study-backup-${dayKey()}.json` });
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('备份已导出', 'success');
      },
    },
    icon('download', 16),
    '导出备份',
  );

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const ok = await confirmDialog('导入会覆盖当前所有进度、生词、错题和笔记。建议先导出备份。确定继续？', {
        title: '导入备份',
        confirmText: '覆盖导入',
        danger: true,
      });
      if (!ok) {
        fileInput.value = '';
        return;
      }
      store.importData(text);
      toast('备份已导入，正在刷新…', 'success');
      setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      toast(`导入失败：${error.message}`, 'error');
    }
    fileInput.value = '';
  });
  const importButton = h(
    'button',
    { type: 'button', class: 'btn btn-ghost', onclick: () => fileInput.click() },
    icon('upload', 16),
    '导入备份',
  );

  const clearButton = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-danger-ghost',
      onclick: async () => {
        const first = await confirmDialog('这会删除当前浏览器里的全部学习记录，且无法撤销。建议先导出备份。', {
          title: '清空学习数据',
          confirmText: '继续',
          danger: true,
        });
        if (!first) return;
        const second = await confirmDialog('最后确认：清空后无法恢复。', {
          title: '再次确认',
          confirmText: '清空全部数据',
          danger: true,
        });
        if (!second) return;
        store.reset();
        toast('已清空，正在刷新…', 'success');
        setTimeout(() => window.location.reload(), 400);
      },
    },
    icon('trash', 16),
    '清空数据',
  );

  container.append(
    h(
      'header',
      { class: 'page-head' },
      h('p', { class: 'eyebrow' }, '个性化'),
      h('h1', {}, '设置'),
      h('p', { class: 'muted' }, '调整阅读与朗读体验，管理只属于你的本地学习数据。'),
    ),
    h(
      'div',
      { class: 'settings-grid' },
      settingsCard('sun', '外观', '主题与字号会立即应用。', h('div', { class: 'setting-group' }, h('span', { class: 'setting-label' }, '主题'), themeControl, h('span', { class: 'setting-label' }, '字号'), fontControl)),
      settingsCard(
        'headphones',
        '朗读与显示',
        '使用浏览器内置语音合成，不依赖外部音频。',
        h(
          'div',
          { class: 'setting-group' },
          h('label', { class: 'setting-row' }, h('span', {}, '语速'), rateSelect),
          h('label', { class: 'setting-row' }, h('span', {}, '英语口音'), voiceSelect),
          h('div', { class: 'setting-row' }, h('span', {}, '试听'), testVoice),
          showZhToggle,
        ),
      ),
      settingsCard(
        'download',
        '数据与备份',
        '进度只保存在当前浏览器；换设备时用备份迁移。',
        h(
          'div',
          { class: 'setting-group' },
          h('div', { class: 'data-actions' }, exportButton, importButton, clearButton),
          fileInput,
          h('p', { class: 'muted storage-note' }, `当前占用约 ${storageKb} KB。清除浏览器数据会同时清除学习记录。`),
        ),
      ),
      settingsCard(
        'note',
        '关于',
        'NCE StudyFree · 新概念英语 1–4 本地学习站',
        h(
          'div',
          { class: 'about-body' },
          h('p', {}, '一个零依赖的静态学习站：课文点读、词汇语法、自动生成练习、生词 SRS、错题本与本地进度。'),
          h(
            'ul',
            { class: 'link-list' },
            h('li', {}, h('a', { href: 'https://github.com/CencyZp/NCEStudyFree', target: '_blank', rel: 'noreferrer' }, 'GitHub 仓库')),
            h('li', {}, h('a', { href: 'https://cencyzp.github.io/NCEStudyFree/', target: '_blank', rel: 'noreferrer' }, '在线站点')),
            h('li', {}, h('a', { href: 'https://github.com/iChochy/NCE', target: '_blank', rel: 'noreferrer' }, '课文与译文来源：iChochy/NCE')),
            h('li', {}, h('a', { href: 'https://github.com/LiDuoMiao/new-concept-english', target: '_blank', rel: 'noreferrer' }, '词汇/语法来源：LiDuoMiao/new-concept-english')),
            h('li', {}, h('a', { href: 'https://github.com/tanle-mtr/ChinaStudyFree', target: '_blank', rel: 'noreferrer' }, '信息架构参考：ChinaStudyFree')),
          ),
          h('p', { class: 'muted license-note' }, '代码以 MIT 许可发布；课文、译文与音频版权归原作者及出版社，本站仅供个人学习、非商业使用。词汇与语法为 AI 辅助整理，仅供参考。'),
          h('p', { class: 'muted' }, '版本 1.0.0 · 无账号 · 无后端 · 无追踪。'),
        ),
      ),
    ),
  );

  return () => unsubscribeVoices();
}
