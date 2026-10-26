import { store } from '../store.js';
import { h, icon, clear, toast, formatPercent } from '../ui.js';
import { GRADES, GRADE_LABELS, sortByDue } from '../srs.js';
import { checkAnswer, choiceText, typeLabel } from '../exercises.js';

function emptyState(title, message, actions = []) {
  return h(
    'section',
    { class: 'empty-state card' },
    h('span', { class: 'empty-icon' }, icon('layers', 28)),
    h('h2', {}, title),
    h('p', { class: 'muted' }, message),
    actions.length ? h('div', { class: 'empty-actions' }, actions) : null,
  );
}

function lessonLabel(meta, fallback = '') {
  if (!meta) return fallback;
  const range =
    meta.lessonTo && meta.lessonTo !== meta.lessonFrom
      ? `Lesson ${meta.lessonFrom}–${meta.lessonTo}`
      : `Lesson ${meta.lessonFrom}`;
  return `${meta.title} · ${range}`;
}

function srsList(cards, store, onRemove) {
  return h(
    'div',
    { class: 'srs-list' },
    cards.map((card) =>
      h(
        'div',
        { class: 'srs-list-row' },
        h('div', {}, h('strong', {}, card.word), h('span', { class: 'muted' }, ` ${card.meaning || ''}`)),
        h('span', { class: 'badge badge-soft' }, store.srsDueLabel(card)),
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-label': `移除 ${card.word}`,
            onclick: () => {
              store.removeSrs(card.id);
              onRemove?.();
            },
          },
          icon('trash', 16),
        ),
      ),
    ),
  );
}

export async function renderReview(container, ctx) {
  const initialTab = ctx.query.get('tab') === 'mistakes' ? 'mistakes' : 'srs';
  const state = { tab: initialTab, flipped: false, queue: sortByDue(store.dueSrs()) };
  let activeCard = null;

  const tabs = h('div', { class: 'segmented', role: 'tablist', 'aria-label': '复习类型' });
  const srsTab = h(
    'button',
    { type: 'button', class: 'segment', role: 'tab', onclick: () => switchTab('srs') },
    icon('layers', 16),
    '生词卡',
    h('span', { class: 'tab-count' }, String(store.dueSrs().length)),
  );
  const mistakesTab = h(
    'button',
    { type: 'button', class: 'segment', role: 'tab', onclick: () => switchTab('mistakes') },
    icon('close', 16),
    '错题本',
    h('span', { class: 'tab-count' }, String(Object.keys(store.state.mistakes).length)),
  );
  tabs.append(srsTab, mistakesTab);

  const content = h('div', { class: 'review-content' });

  function switchTab(tab) {
    state.tab = tab;
    srsTab.classList.toggle('is-active', tab === 'srs');
    mistakesTab.classList.toggle('is-active', tab === 'mistakes');
    srsTab.setAttribute('aria-selected', String(tab === 'srs'));
    mistakesTab.setAttribute('aria-selected', String(tab === 'mistakes'));
    if (tab === 'srs') renderSrs();
    else renderMistakes();
    window.history.replaceState(null, '', `#/review?tab=${tab}`);
  }

  function renderSrs() {
    clear(content);
    const all = sortByDue(store.allSrs());
    if (!all.length) {
      content.appendChild(
        emptyState('生词本还是空的', '在课程页把不熟的单词加入生词本，系统会按间隔重复安排复习。', [
          h('a', { class: 'btn btn-primary', href: '#/book/1' }, '去课程页'),
        ]),
      );
      return;
    }

    state.queue = state.queue.filter((card) => store.state.srs[card.id]);
    if (!state.queue.length) {
      activeCard = null;
      const next = all[0];
      content.appendChild(
        h(
          'section',
          { class: 'card review-done' },
          h('span', { class: 'empty-icon' }, icon('check', 30)),
          h('h2', { tabindex: '-1' }, '今天的生词已复习完'),
          h('p', { class: 'muted' }, `下一张：${next.word}，${store.srsDueLabel(next)}。`),
          h(
            'div',
            { class: 'review-done-actions' },
            h('a', { class: 'btn btn-primary', href: '#/book/1' }, '继续学课文'),
            h('a', { class: 'btn btn-ghost', href: '#/stats' }, '查看统计'),
          ),
          h(
            'details',
            { class: 'all-srs' },
            h('summary', {}, `查看全部 ${all.length} 张生词卡`),
            srsList(all, store, () => renderSrs()),
          ),
        ),
      );
      return;
    }

    activeCard = state.queue[0];
    const meaning = activeCard.meaning || '';
    const speak = (event) => {
      event.stopPropagation();
      ctx.tts.speak(activeCard.word, { rate: store.state.settings.ttsRate, voiceName: store.state.settings.ttsVoice });
    };

    const card = h(
      'div',
      {
        class: `flashcard ${state.flipped ? 'is-flipped' : ''}`,
        role: 'group',
        tabindex: '0',
        'aria-labelledby': 'flash-word',
        onclick: () => {
          state.flipped = !state.flipped;
          card.classList.toggle('is-flipped', state.flipped);
          gradeRow.hidden = !state.flipped;
        },
        onkeydown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            card.click();
          }
        },
      },
      h(
        'div',
        { class: 'flashcard-top' },
        h('span', { class: 'badge' }, `剩余 ${state.queue.length} 张`),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': '朗读单词', onclick: speak }, icon('volume', 18)),
      ),
      h(
        'div',
        { class: 'flashcard-front' },
        h('h1', { class: 'flash-word', id: 'flash-word' }, activeCard.word),
        activeCard.phonetic ? h('p', { class: 'phonetic' }, activeCard.phonetic) : null,
        activeCard.pos ? h('p', { class: 'muted' }, activeCard.pos) : null,
        h('p', { class: 'flash-hint' }, '点击卡片或按空格查看释义'),
      ),
      h(
        'div',
        { class: 'flashcard-back' },
        h('p', { class: 'flash-meaning' }, meaning || '暂无释义'),
        activeCard.usage ? h('p', { class: 'muted' }, activeCard.usage) : null,
        h('p', { class: 'flash-hint' }, '按 1–4 或点击下面按钮评分'),
      ),
    );

    const gradeRow = h(
      'div',
      { class: 'grade-row', hidden: !state.flipped },
      GRADES.map((grade, index) =>
        h(
          'button',
          {
            type: 'button',
            class: `btn grade-btn grade-${grade}`,
            onclick: () => {
              const updated = store.gradeSrs(activeCard.id, grade);
              if (updated) toast(`已记录：${GRADE_LABELS[grade]}，${store.srsDueLabel(updated)}复习`, 'success');
              state.queue = state.queue.filter((item) => item.id !== activeCard.id);
              state.flipped = false;
              renderSrs();
            },
          },
          h('span', { class: 'grade-key' }, String(index + 1)),
          GRADE_LABELS[grade],
        ),
      ),
    );

    const nextButton = h(
      'button',
      {
        type: 'button',
        class: 'btn btn-ghost',
        onclick: () => {
          state.queue = state.queue.slice(1);
          state.flipped = false;
          renderSrs();
        },
      },
      '稍后再看',
    );

    content.append(
      h(
        'div',
        { class: 'review-head' },
        h('div', {}, h('p', { class: 'eyebrow' }, '间隔重复'), h('h1', {}, '生词卡')),
        h('p', { class: 'muted' }, `今日待复习 ${state.queue.length} 张 · 全部 ${all.length} 张`),
      ),
      h('div', { class: 'flashcard-wrap' }, card),
      gradeRow,
      h('div', { class: 'review-actions' }, nextButton, h('a', { class: 'btn btn-ghost', href: '#/stats' }, '学习统计')),
      h('p', { class: 'muted shortcut-hint' }, '空格翻面 · 1 重来 · 2 困难 · 3 记得 · 4 太简单'),
    );
    requestAnimationFrame(() => {
      if (!ctx.signal.aborted) document.querySelector('.flashcard')?.focus({ preventScroll: true });
    });
  }

  function renderMistakes() {
    clear(content);
    const mistakes = Object.values(store.state.mistakes).sort((a, b) => (b.lastWrong || 0) - (a.lastWrong || 0));
    if (!mistakes.length) {
      content.appendChild(
        emptyState('错题本是空的', '练习中答错的题会自动收进来；同一题连续答对两次后移出。', [
          h('a', { class: 'btn btn-primary', href: '#/book/1' }, '去做练习'),
        ]),
      );
      return;
    }

    content.append(
      h(
        'div',
        { class: 'review-head' },
        h('div', {}, h('p', { class: 'eyebrow' }, '针对性重练'), h('h1', {}, '错题本')),
        h('p', { class: 'muted' }, `${mistakes.length} 道题 · 连续答对两次自动移出`),
      ),
      h(
        'div',
        { class: 'mistake-list' },
        mistakes.map((mistake) => {
          const question = mistake.question;
          const meta = mistake.lessonMeta;
          const selected = { value: null };
          const feedback = h('div', { class: 'redo-feedback' });
          const submitBtn = h('button', { type: 'button', class: 'btn btn-primary' }, '提交');
          let input = null;

          const submit = () => {
            if (submitBtn.disabled) return;
            const value = selected.value;
            if (value === null || value === undefined || String(value).trim() === '') {
              toast('请先作答', 'info');
              return;
            }
            const correct = checkAnswer(question, value);
            store.recordAnswer(mistake.lessonId, question, correct, choiceText(question, value), meta);
            submitBtn.disabled = true;
            if (input) input.disabled = true;
            feedback.replaceChildren(
              h(
                'div',
                { class: `feedback ${correct ? 'is-correct' : 'is-wrong'}` },
                h(
                  'div',
                  { class: 'feedback-head' },
                  icon(correct ? 'check' : 'close', 17),
                  h('strong', {}, correct ? '回答正确' : '再练一次'),
                ),
                h('p', {}, h('span', { class: 'muted' }, '正确答案：'), h('strong', {}, question.kind === 'choice' ? question.options[question.answer] : question.answer)),
                question.explain ? h('p', { class: 'feedback-explain' }, question.explain) : null,
                correct
                  ? h('p', { class: 'muted' }, '再答对一次就会移出错题本。')
                  : h('p', { class: 'muted' }, '别急，回到课文找到这句话再读一遍。'),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn btn-ghost btn-sm',
                    onclick: () => renderMistakes(),
                  },
                  correct ? '返回错题列表' : '再试一次',
                ),
              ),
            );
            if (correct) toast('答对了，继续保持', 'success');
          };

          const answerArea =
            question.kind === 'choice'
              ? h(
                  'div',
                  { class: 'option-list compact-options' },
                  question.options.map((option, index) =>
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'option',
                        onclick: (event) => {
                          if (submitBtn.disabled) return;
                          selected.value = index;
                          event.currentTarget.parentElement
                            .querySelectorAll('.option')
                            .forEach((button, buttonIndex) => button.classList.toggle('is-selected', buttonIndex === index));
                        },
                      },
                      h('span', { class: 'option-key' }, String.fromCharCode(65 + index)),
                      h('span', { class: 'option-text' }, option),
                    ),
                  ),
                )
              : (input = h('input', {
                  class: 'input',
                  type: 'text',
                  placeholder: question.placeholder || '输入答案',
                  oninput: (event) => {
                    selected.value = event.target.value;
                  },
                  onkeydown: (event) => {
                    if (event.key === 'Enter') submit();
                  },
                }));

          submitBtn.addEventListener('click', submit);

          return h(
            'article',
            { class: 'mistake-card card' },
            h(
              'div',
              { class: 'mistake-head' },
              h(
                'div',
                {},
                h('p', { class: 'eyebrow' }, meta ? lessonLabel(meta) : mistake.lessonId),
                h('h3', {}, String(question.prompt || '').split('\n')[0]),
              ),
              h('span', { class: 'badge badge-danger' }, `错 ${mistake.wrong || 1} 次`),
            ),
            h('p', { class: 'muted mistake-sub' }, `${typeLabel(question.type)} · 上次作答：${mistake.lastAnswer || '未记录'}`),
            h(
              'details',
              { class: 'redo-box' },
              h('summary', {}, '重做这道题'),
              h('div', { class: 'redo-body' }, h('p', { class: 'prompt-text' }, question.prompt), answerArea, h('div', { class: 'redo-actions' }, submitBtn), feedback),
            ),
          );
        }),
      ),
    );
  }

  document.addEventListener(
    'keydown',
    (event) => {
      if (state.tab !== 'srs' || !activeCard) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.matches('input, textarea, select') || target.isContentEditable)
      ) {
        return;
      }
      // 卡片本身、按钮和链接有原生键盘行为；数字评分仍应可用
      if (event.code === 'Space' && target instanceof HTMLElement && target.closest('button, a, summary, .flashcard')) {
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        state.flipped = !state.flipped;
        renderSrs();
      } else if (state.flipped && /^[1-4]$/.test(event.key)) {
        if (!activeCard || !state.queue.some((card) => card.id === activeCard.id)) return;
        event.preventDefault();
        const grade = GRADES[Number(event.key) - 1];
        const updated = store.gradeSrs(activeCard.id, grade);
        if (updated) toast(`已记录：${GRADE_LABELS[grade]}，${store.srsDueLabel(updated)}复习`, 'success');
        state.queue = state.queue.filter((item) => item.id !== activeCard.id);
        state.flipped = false;
        renderSrs();
      }
    },
    { signal: ctx.signal },
  );

  container.append(
    h(
      'header',
      { class: 'page-head' },
      h('p', { class: 'eyebrow' }, '巩固'),
      h('h1', {}, '复习'),
      h('p', { class: 'muted' }, '到期生词 + 错题重练，把“学过”变成“记住”。'),
    ),
    tabs,
    content,
  );
  switchTab(initialTab);
}
