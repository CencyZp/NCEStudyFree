import { store } from '../store.js';
import { h, icon, clear, toast, formatPercent, debounce } from '../ui.js';
import { checkAnswer, choiceText, typeLabel } from '../exercises.js';

const TAB_DEFS = [
  { id: 'text', label: '课文', icon: 'book' },
  { id: 'vocab', label: '词汇', icon: 'note' },
  { id: 'grammar', label: '语法', icon: 'layers' },
  { id: 'practice', label: '练习', icon: 'check' },
  { id: 'notes', label: '笔记', icon: 'note' },
];

function lessonLabel(unit) {
  return unit.lessonTo && unit.lessonTo !== unit.lessonFrom
    ? `Lesson ${unit.lessonFrom}–${unit.lessonTo}`
    : `Lesson ${unit.lessonFrom}`;
}

function emptyPanel(title, message) {
  return h(
    'div',
    { class: 'empty-state card' },
    h('span', { class: 'empty-icon' }, icon('book', 26)),
    h('h3', {}, title),
    h('p', { class: 'muted' }, message),
  );
}

export async function renderLesson(container, ctx, bookId, unitId) {
  const book = ctx.getBookMeta(bookId);
  if (!book) {
    container.appendChild(emptyPanel('没有找到这本教材', '请从首页重新选择。'));
    return;
  }
  await ctx.ensureBookData(bookId);
  const unit = ctx.getUnit(bookId, unitId);
  if (!unit) {
    container.appendChild(emptyPanel('没有找到这一课', '课号可能已变化，请返回课程列表重新选择。'));
    return;
  }

  const meta = {
    id: unit.id,
    book: unit.book,
    title: unit.title,
    titleZh: unit.titleZh,
    lessonFrom: unit.lessonFrom,
    lessonTo: unit.lessonTo,
    unit: unit.unit,
  };
  store.markVisit(unit.id, meta);
  const settings = store.getSettings();
  const state = {
    tab: ['text', 'vocab', 'grammar', 'practice', 'notes'].includes(ctx.query.get('tab'))
      ? ctx.query.get('tab')
      : 'text',
    showZh: settings.showZh,
    rate: Number(settings.ttsRate) || 1,
    voice: settings.ttsVoice || '',
    current: -1,
    playMode: 'idle',
    loopCurrent: false,
    playToken: 0,
  };

  const tabButtons = {};
  const panels = {};
  const tabBar = h('div', { class: 'tabs', role: 'tablist', 'aria-label': '课程内容切换' });

  const statusBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-ghost',
      onclick: () => {
        const progress = store.getProgress(unit.id);
        const nextStatus = progress.status === 'done' ? 'learning' : 'done';
        store.setStatus(unit.id, nextStatus);
        updateStatusButton();
        toast(nextStatus === 'done' ? '已标记为完成' : '已取消完成标记', 'success');
      },
    },
    '',
  );
  const favoriteBtn = h(
    'button',
    {
      type: 'button',
      class: 'icon-btn favorite-btn',
      'aria-label': '收藏本课',
      onclick: () => {
        store.toggleFavorite(unit.id);
        updateFavorite();
      },
    },
    icon('star', 19),
  );

  function updateStatusButton() {
    const progress = store.getProgress(unit.id);
    const done = progress.status === 'done';
    statusBtn.className = `btn ${done ? 'btn-success' : 'btn-ghost'}`;
    statusBtn.replaceChildren(icon(done ? 'check' : 'clock', 16), done ? '已完成' : '标记完成');
    statusBtn.setAttribute('aria-pressed', String(done));
  }

  function updateFavorite() {
    const active = store.isFavorite(unit.id);
    favoriteBtn.classList.toggle('is-active', active);
    favoriteBtn.setAttribute('aria-pressed', String(active));
  }
  updateStatusButton();
  updateFavorite();

  const unitIndex = window.NCE.booksData[bookId].units.findIndex((item) => item.id === unit.id);
  const prevUnit = window.NCE.booksData[bookId].units[unitIndex - 1];
  const nextUnit = window.NCE.booksData[bookId].units[unitIndex + 1];

  const navButton = (target, label, iconName) =>
    target
      ? h('a', { class: 'btn btn-ghost', href: `#/lesson/${target.id}` }, icon(iconName, 16), label)
      : h('span', { class: 'btn btn-ghost is-disabled', 'aria-disabled': 'true' }, icon(iconName, 16), label);

  const questionSpeak = h(
    'button',
    {
      type: 'button',
      class: 'icon-btn',
      'aria-label': '朗读课前问题',
      onclick: () => {
        if (!unit.question) return;
        ctx.tts.speak(unit.question, { rate: state.rate, voiceName: state.voice });
      },
    },
    icon('volume', 17),
  );

  const header = h(
    'section',
    { class: 'lesson-header' },
    h(
      'div',
      { class: 'lesson-breadcrumb' },
      h('a', { href: `#/book/${book.id}` }, `第 ${book.id} 册 · ${book.titleZh}`),
      h('span', {}, '/'),
      h('span', {}, lessonLabel(unit)),
    ),
    h(
      'div',
      { class: 'lesson-title-row' },
      h(
        'div',
        { class: 'lesson-title-copy' },
        h('p', { class: 'eyebrow' }, `${lessonLabel(unit)} · ${book.level}`),
        h('h1', {}, unit.title),
        unit.titleZh ? h('p', { class: 'lesson-zh' }, unit.titleZh) : null,
      ),
      h('div', { class: 'lesson-actions' }, favoriteBtn, statusBtn),
    ),
    unit.question
      ? h(
          'div',
          { class: 'question-callout' },
          h('span', { class: 'question-icon' }, icon('headphones', 20)),
          h('div', {}, h('span', { class: 'question-label' }, '课前问题'), h('p', {}, unit.question)),
          questionSpeak,
        )
      : null,
  );

  // ---------- 课文 ----------
  const textPanel = h('section', { class: 'tab-panel', role: 'tabpanel', 'aria-label': '课文' });
  panels.text = textPanel;
  const sentenceNodes = [];
  const textList = h('div', { class: 'sentence-list' });
  let voiceSelect;
  let playAllBtn;
  let loopBtn;
  let stopBtn;
  let showZhBtn;

  function setActive(index) {
    state.current = index;
    sentenceNodes.forEach((node, nodeIndex) => node.classList.toggle('is-active', nodeIndex === index));
    if (index >= 0) sentenceNodes[index]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function stopPlayback() {
    state.playToken += 1;
    ctx.tts.cancel();
    state.playMode = 'idle';
    state.loopCurrent = false;
    setActive(-1);
    updatePlayControls();
  }

  function playSentence(index) {
    const sentence = unit.sentences[index];
    if (!sentence) return;
    const token = ++state.playToken;
    setActive(index);
    ctx.tts.speak(sentence.en, {
      rate: state.rate,
      voiceName: state.voice,
      onEnd: () => {
        if (token !== state.playToken) return;
        if (state.loopCurrent) {
          playSentence(index);
          return;
        }
        if (state.playMode === 'all' && index < unit.sentences.length - 1) {
          playSentence(index + 1);
        } else {
          state.playMode = 'idle';
          setActive(-1);
          updatePlayControls();
        }
      },
      onError: (error) => {
        if (token !== state.playToken) return;
        state.playMode = 'idle';
        updatePlayControls();
        if (error) toast('语音朗读不可用，请检查系统语音包', 'error');
      },
    });
    updatePlayControls();
  }

  function playAll() {
    state.playMode = 'all';
    state.loopCurrent = false;
    playSentence(state.current >= 0 ? state.current : 0);
  }

  function toggleLoop() {
    state.loopCurrent = !state.loopCurrent;
    if (state.loopCurrent && state.current >= 0) playSentence(state.current);
    updatePlayControls();
  }

  function updatePlayControls() {
    if (playAllBtn) {
      playAllBtn.replaceChildren(
        icon(state.playMode === 'all' ? 'pause' : 'play', 16),
        state.playMode === 'all' ? '朗读中' : '朗读全文',
      );
    }
    loopBtn?.classList.toggle('is-active', state.loopCurrent);
    if (stopBtn) stopBtn.disabled = state.playMode === 'idle';
  }

  unit.sentences.forEach((sentence, index) => {
    const row = h(
      'div',
      {
        class: 'sentence',
        dataset: { index: String(index) },
        onclick: (event) => {
          if (event.target.closest('button')) return;
          playSentence(index);
        },
      },
      h(
        'button',
        {
          type: 'button',
          class: 'sentence-play',
          'aria-label': `朗读第 ${index + 1} 句`,
          onclick: () => playSentence(index),
        },
        icon('play', 15),
      ),
      h(
        'div',
        { class: 'sentence-text' },
        h('p', { class: 'sentence-en' }, sentence.en),
        sentence.zh
          ? h('p', { class: 'sentence-zh' }, sentence.zh)
          : h('p', { class: 'sentence-zh is-missing' }, '暂无译文'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'sentence-loop',
          title: '循环本句',
          'aria-label': `循环第 ${index + 1} 句`,
          onclick: () => {
            state.loopCurrent = true;
            playSentence(index);
          },
        },
        icon('repeat', 15),
      ),
    );
    sentenceNodes.push(row);
    textList.appendChild(row);
  });

  if (state.showZh) textList.classList.remove('hide-zh');
  else textList.classList.add('hide-zh');

  const ttsNotice = ctx.tts.supported
    ? null
    : h('p', { class: 'notice' }, '当前浏览器不支持语音合成；你仍然可以阅读课文、做练习和记录进度。');

  const toolbar = h(
    'div',
    { class: 'reading-toolbar' },
    (playAllBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => (state.playMode === 'all' ? stopPlayback() : playAll()) }, '')),
    (stopBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: stopPlayback, disabled: true }, icon('stop', 15), '停止')),
    (loopBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: toggleLoop }, icon('repeat', 15), '单句循环')),
    h(
      'label',
      { class: 'toolbar-field' },
      h('span', {}, '语速'),
      h(
        'select',
        {
          class: 'select select-sm',
          onchange: (event) => {
            state.rate = Number(event.target.value);
            store.updateSettings({ ttsRate: state.rate });
          },
        },
        [0.6, 0.75, 0.9, 1, 1.15, 1.3].map((rate) =>
          h('option', { value: String(rate), selected: Math.abs(rate - state.rate) < 0.01 }, `${rate.toFixed(2)}×`),
        ),
      ),
    ),
    h(
      'label',
      { class: 'toolbar-field voice-field' },
      h('span', {}, '口音'),
      (voiceSelect = h('select', {
        class: 'select select-sm',
        onchange: (event) => {
          state.voice = event.target.value;
          store.updateSettings({ ttsVoice: state.voice });
        },
      })),
    ),
    (showZhBtn = h(
      'button',
      {
        type: 'button',
        class: `btn btn-ghost ${state.showZh ? 'is-active' : ''}`,
        onclick: () => {
          state.showZh = !state.showZh;
          textList.classList.toggle('hide-zh', !state.showZh);
          showZhBtn.classList.toggle('is-active', state.showZh);
          showZhBtn.setAttribute('aria-pressed', String(state.showZh));
          store.updateSettings({ showZh: state.showZh });
        },
        'aria-pressed': String(state.showZh),
      },
      icon('note', 15),
      '中文',
    )),
  );

  function refreshVoiceSelect() {
    const voices = ctx.tts.getVoices();
    voiceSelect.replaceChildren(h('option', { value: '' }, voices.length ? '系统默认' : '暂无英语语音'));
    for (const voice of voices) {
      voiceSelect.appendChild(h('option', { value: voice.name }, `${voice.name} (${voice.lang})`));
    }
    voiceSelect.value = voices.some((voice) => voice.name === state.voice) ? state.voice : '';
    voiceSelect.disabled = !voices.length;
  }
  refreshVoiceSelect();
  const unsubscribeVoices = ctx.tts.subscribe(refreshVoiceSelect);

  updatePlayControls();

  // 跟读录音
  const recordBtn = h('button', { type: 'button', class: 'btn btn-ghost' }, icon('mic', 16), '开始录音');
  const replayBtn = h('button', { type: 'button', class: 'btn btn-ghost', disabled: true }, icon('volume', 16), '回放');
  const recordStatus = h('span', { class: 'muted' }, ctx.recorder.supported ? '录下自己的声音，和课文对照。' : '当前浏览器不支持录音。');
  recordBtn.disabled = !ctx.recorder.supported;
  let recordedUrl = '';
  recordBtn.addEventListener('click', async () => {
    try {
      if (ctx.recorder.isRecording) {
        recordedUrl = await ctx.recorder.stop();
        recordBtn.replaceChildren(icon('mic', 16), '重新录音');
        replayBtn.disabled = false;
        recordStatus.textContent = '录音完成，点击回放。';
      } else {
        await ctx.recorder.start();
        recordBtn.replaceChildren(icon('stop', 16), '停止录音');
        recordStatus.textContent = '正在录音…再次点击停止。';
      }
    } catch (error) {
      recordStatus.textContent = error?.name === 'NotAllowedError' ? '麦克风权限被拒绝。' : '无法开始录音，请检查麦克风。';
      toast(recordStatus.textContent, 'error');
    }
  });
  replayBtn.addEventListener('click', () => {
    if (recordedUrl) ctx.recorder.play(recordedUrl);
  });

  textPanel.appendChild(toolbar);
  if (ttsNotice) textPanel.appendChild(ttsNotice);
  textPanel.appendChild(textList);
  textPanel.appendChild(h('div', { class: 'recording-box' }, recordBtn, replayBtn, recordStatus));

  // ---------- 词汇 ----------
  const vocabPanel = h('section', { class: 'tab-panel', role: 'tabpanel', 'aria-label': '词汇' });
  panels.vocab = vocabPanel;
  if (unit.vocab.length) {
    const grid = h('div', { class: 'vocab-grid' });
    for (const vocab of unit.vocab) {
      const meaning = vocab.meanings[0] || {};
      const srsButton = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' });
      const syncSrs = () => {
        const added = store.hasSrs(vocab, unit.id);
        srsButton.replaceChildren(icon(added ? 'check' : 'star', 15), added ? '已在生词本' : '加入生词本');
        srsButton.disabled = added;
      };
      srsButton.addEventListener('click', () => {
        const added = store.addSrs(vocab, unit.id);
        if (added) toast(`已加入生词本：${vocab.word}`, 'success');
        syncSrs();
      });
      syncSrs();
      grid.appendChild(
        h(
          'article',
          { class: 'vocab-card' },
          h(
            'div',
            { class: 'vocab-top' },
            h('h3', {}, vocab.word),
            h(
              'button',
              {
                type: 'button',
                class: 'icon-btn',
                'aria-label': `朗读 ${vocab.word}`,
                onclick: () => ctx.tts.speak(vocab.word, { rate: state.rate, voiceName: state.voice }),
              },
              icon('volume', 16),
            ),
          ),
          vocab.phonetic ? h('p', { class: 'phonetic' }, vocab.phonetic) : null,
          h('p', { class: 'vocab-meaning' }, h('span', { class: 'pos' }, meaning.pos || ''), meaning.meaning || ''),
          meaning.usage ? h('p', { class: 'vocab-usage' }, meaning.usage) : null,
          h('div', { class: 'vocab-actions' }, srsButton),
        ),
      );
    }
    vocabPanel.append(
      h('div', { class: 'panel-head' }, h('h2', {}, `本课词汇 · ${unit.vocab.length}`), h('p', { class: 'muted' }, '点击音标旁的喇叭听发音；加入生词本后会按间隔重复安排复习。')),
      grid,
    );
  } else {
    vocabPanel.appendChild(emptyPanel('本课暂无词汇数据', '课文与练习仍可使用；词汇笔记来自第三方整理，个别课程可能缺失。'));
  }

  // ---------- 语法 ----------
  const grammarPanel = h('section', { class: 'tab-panel', role: 'tabpanel', 'aria-label': '语法与句型' });
  panels.grammar = grammarPanel;
  if (unit.grammar.length || unit.patterns.length) {
    if (unit.grammar.length) {
      grammarPanel.appendChild(h('div', { class: 'panel-head' }, h('h2', {}, `语法点 · ${unit.grammar.length}`)));
      const list = h('div', { class: 'grammar-list' });
      unit.grammar.forEach((grammar, index) => {
        const body = h(
          'div',
          { class: 'grammar-body' },
          grammar.definition ? h('p', {}, grammar.definition) : null,
          grammar.structure ? h('p', { class: 'grammar-structure' }, h('strong', {}, '结构：'), grammar.structure) : null,
          grammar.usage ? h('p', { class: 'muted' }, grammar.usage) : null,
          grammar.examples.length
            ? h(
                'ul',
                { class: 'example-list' },
                grammar.examples.map((example) =>
                  h(
                    'li',
                    {},
                    h('span', { class: 'example-en' }, example.en),
                    example.zh ? h('span', { class: 'example-zh' }, example.zh) : null,
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'icon-btn tiny',
                        'aria-label': '朗读例句',
                        onclick: () => ctx.tts.speak(example.en, { rate: state.rate, voiceName: state.voice }),
                      },
                      icon('volume', 14),
                    ),
                  ),
                ),
              )
            : null,
        );
        list.appendChild(
          h(
            'details',
            { class: 'grammar-item', open: index === 0 },
            h('summary', {}, h('span', {}, grammar.title), grammar.structure ? h('small', {}, grammar.structure) : null),
            body,
          ),
        );
      });
      grammarPanel.appendChild(list);
    }
    if (unit.patterns.length) {
      grammarPanel.appendChild(h('div', { class: 'panel-head spaced' }, h('h2', {}, `句型模仿 · ${unit.patterns.length}`)));
      grammarPanel.appendChild(
        h(
          'div',
          { class: 'pattern-list' },
          unit.patterns.map((pattern) =>
            h(
              'article',
              { class: 'pattern-card' },
              h('h3', {}, pattern.pattern),
              pattern.explanation ? h('p', { class: 'muted' }, pattern.explanation) : null,
              pattern.original
                ? h(
                    'p',
                    { class: 'pattern-original' },
                    h('span', {}, pattern.original.en),
                    pattern.original.zh ? h('small', {}, pattern.original.zh) : null,
                  )
                : null,
              pattern.examples.length
                ? h(
                    'ul',
                    { class: 'example-list compact' },
                    pattern.examples.map((example) =>
                      h('li', {}, h('span', { class: 'example-en' }, example.en), example.zh ? h('span', { class: 'example-zh' }, example.zh) : null),
                    ),
                  )
                : null,
            ),
          ),
        ),
      );
    }
  } else {
    grammarPanel.appendChild(emptyPanel('本课暂无语法笔记', '可以直接用课文和练习学习；语法内容来自第三方整理，个别课程可能缺失。'));
  }

  // ---------- 练习 ----------
  const practicePanel = h('section', { class: 'tab-panel', role: 'tabpanel', 'aria-label': '练习' });
  panels.practice = practicePanel;
  const practiceRoot = h('div', { class: 'practice-root' });
  practicePanel.appendChild(practiceRoot);
  const practiceState = {
    index: 0,
    selected: null,
    submitted: false,
    correct: 0,
    results: [],
    scored: false,
  };
  let practiceApi = { select: null, submit: null, next: null };

  function scoreSummary() {
    const total = unit.exercises.length;
    const score = total ? practiceState.correct / total : 0;
    if (!practiceState.scored) {
      store.markScore(unit.id, score);
      practiceState.scored = true;
      updateStatusButton();
    }
    return { total, score };
  }

  function renderPractice() {
    clear(practiceRoot);
    practiceApi = { select: null, submit: null, next: null };
    const questions = unit.exercises;
    if (!questions.length) {
      practiceRoot.appendChild(emptyPanel('本课暂无练习题', '课文、词汇和语法仍可学习。'));
      return;
    }

    if (practiceState.index >= questions.length) {
      const { total, score } = scoreSummary();
      practiceRoot.appendChild(
        h(
          'div',
          { class: 'practice-summary card' },
          h('p', { class: 'eyebrow' }, '练习完成'),
          h('div', { class: 'score-ring', style: { '--percent': `${Math.round(score * 100)}%` } }, h('strong', {}, formatPercent(score))),
          h('h2', {}, `答对 ${practiceState.correct} / ${total} 题`),
          h(
            'p',
            { class: 'muted' },
            score >= 0.8 ? '达到本课完成标准（80%），已计入进度。' : '还没到 80%，建议再做一次，或回到课文重读错题对应的句子。',
          ),
          h(
            'div',
            { class: 'summary-actions' },
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn-primary',
                onclick: () => {
                  practiceState.index = 0;
                  practiceState.correct = 0;
                  practiceState.results = [];
                  practiceState.selected = null;
                  practiceState.submitted = false;
                  practiceState.scored = false;
                  renderPractice();
                },
              },
              '再做一次',
            ),
            h('a', { class: 'btn btn-ghost', href: '#/review?tab=mistakes' }, '去错题本'),
            h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => switchTab('text') }, '回到课文'),
          ),
        ),
      );
      return;
    }

    const question = questions[practiceState.index];
    const isLast = practiceState.index === questions.length - 1;
    const progressPercent = Math.round(((practiceState.index + (practiceState.submitted ? 1 : 0)) / questions.length) * 100);

    const optionButtons = [];
    let answerInput = null;

    const submit = () => {
      if (practiceState.submitted) return;
      const value = practiceState.selected;
      if (value === null || value === undefined || String(value).trim() === '') {
        toast('请先作答，再提交。', 'info');
        return;
      }
      const correct = checkAnswer(question, value);
      practiceState.submitted = true;
      practiceState.results.push({ question, correct, value });
      if (correct) practiceState.correct += 1;
      store.recordAnswer(unit.id, question, correct, choiceText(question, value), meta);
      renderPractice();
    };

    const next = () => {
      if (!practiceState.submitted) return;
      practiceState.index += 1;
      practiceState.selected = null;
      practiceState.submitted = false;
      renderPractice();
    };

    const select = (index) => {
      if (practiceState.submitted) return;
      practiceState.selected = index;
      renderPractice();
    };

    practiceApi = { select, submit, next };

    const promptBlock = h(
      'div',
      { class: 'question-prompt' },
      String(question.prompt || '')
        .split('\n')
        .filter(Boolean)
        .map((line) => h('p', {}, line)),
    );

    const choiceBlock = question.kind === 'choice'
      ? h(
          'div',
          { class: 'option-list' },
          question.options.map((option, index) => {
            const selected = practiceState.selected === index;
            const isCorrect = practiceState.submitted && index === question.answer;
            const isWrong = practiceState.submitted && selected && index !== question.answer;
            const button = h(
              'button',
              {
                type: 'button',
                class: `option ${selected ? 'is-selected' : ''} ${isCorrect ? 'is-correct' : ''} ${isWrong ? 'is-wrong' : ''}`,
                disabled: practiceState.submitted,
                onclick: () => select(index),
              },
              h('span', { class: 'option-key' }, String.fromCharCode(65 + index)),
              h('span', { class: 'option-text' }, option),
            );
            optionButtons.push(button);
            return button;
          }),
        )
      : h(
          'div',
          { class: 'answer-box' },
          question.type === 'dictation'
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'btn btn-ghost dictation-play',
                  onclick: () => ctx.tts.speak(question.playText, { rate: state.rate, voiceName: state.voice }),
                },
                icon('volume', 16),
                '播放句子',
              )
            : null,
          (answerInput = h('input', {
            class: 'input answer-input',
            type: 'text',
            value: practiceState.selected ?? '',
            placeholder: question.placeholder || '输入答案',
            disabled: practiceState.submitted,
            autocomplete: 'off',
            oninput: (event) => {
              practiceState.selected = event.target.value;
            },
            onkeydown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (practiceState.submitted) next();
                else submit();
              }
            },
          })),
        );

    const feedback = practiceState.submitted
      ? h(
          'div',
          { class: `feedback ${checkAnswer(question, practiceState.selected) ? 'is-correct' : 'is-wrong'}` },
          h(
            'div',
            { class: 'feedback-head' },
            icon(checkAnswer(question, practiceState.selected) ? 'check' : 'close', 18),
            h('strong', {}, checkAnswer(question, practiceState.selected) ? '回答正确' : '还差一点'),
          ),
          h('p', {}, h('span', { class: 'muted' }, '正确答案：'), h('strong', {}, question.kind === 'choice' ? question.options[question.answer] : question.answer)),
          question.explain ? h('p', { class: 'feedback-explain' }, question.explain) : null,
        )
      : null;

    practiceRoot.appendChild(
      h(
        'div',
        { class: 'practice-card card' },
        h(
          'div',
          { class: 'practice-head' },
          h('div', {}, h('span', { class: 'badge' }, typeLabel(question.type)), h('span', { class: 'muted' }, `第 ${practiceState.index + 1} / ${questions.length} 题`)),
          h('span', { class: 'muted' }, `当前答对 ${practiceState.correct} 题`),
        ),
        h('div', { class: 'practice-progress' }, h('span', { style: { width: `${progressPercent}%` } })),
        promptBlock,
        question.hint ? h('p', { class: 'question-hint' }, question.hint) : null,
        choiceBlock,
        feedback,
        h(
          'div',
          { class: 'practice-actions' },
          practiceState.submitted
            ? h('button', { type: 'button', class: 'btn btn-primary', onclick: next }, isLast ? '查看结果' : '下一题', icon('chevron', 16))
            : h('button', { type: 'button', class: 'btn btn-primary', onclick: submit }, '提交答案'),
          h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => switchTab('text') }, '回课文查找'),
        ),
      ),
    );
    if (answerInput && !practiceState.submitted) {
      setTimeout(() => answerInput.focus({ preventScroll: true }), 0);
    }
  }

  // ---------- 笔记 ----------
  const notesPanel = h('section', { class: 'tab-panel', role: 'tabpanel', 'aria-label': '笔记' });
  panels.notes = notesPanel;
  const noteStatus = h('span', { class: 'muted' }, '自动保存在本地');
  const noteInput = h('textarea', {
    class: 'textarea note-input',
    rows: '10',
    placeholder: '记下这一课的生词、难句、语法提醒，或你自己的翻译…',
    value: store.getNote(unit.id),
  });
  const saveNote = debounce(() => {
    store.saveNote(unit.id, noteInput.value);
    noteStatus.textContent = '已保存';
  }, 500);
  noteInput.addEventListener('input', () => {
    noteStatus.textContent = '保存中…';
    saveNote();
  });
  notesPanel.append(
    h('div', { class: 'panel-head' }, h('h2', {}, '学习笔记'), noteStatus),
    noteInput,
    h(
      'p',
      { class: 'muted note-tip' },
      `本课 ${unit.sentences.length} 句 · ${unit.vocab.length} 个词条 · ${unit.exercises.length} 道练习。笔记只保存在当前浏览器，可在设置中导出备份。`,
    ),
  );

  // ---------- 标签与面板 ----------
  for (const def of TAB_DEFS) {
    const count =
      def.id === 'vocab'
        ? unit.vocab.length
        : def.id === 'grammar'
          ? unit.grammar.length + unit.patterns.length
          : def.id === 'practice'
            ? unit.exercises.length
            : null;
    const button = h(
      'button',
      {
        type: 'button',
        class: 'tab',
        role: 'tab',
        'aria-selected': 'false',
        'aria-controls': `panel-${def.id}`,
        onclick: () => switchTab(def.id),
      },
      icon(def.icon, 16),
      h('span', {}, def.label),
      count ? h('span', { class: 'tab-count' }, String(count)) : null,
    );
    tabButtons[def.id] = button;
    tabBar.appendChild(button);
    panels[def.id].id = `panel-${def.id}`;
  }

  function switchTab(tab) {
    state.tab = tab;
    for (const def of TAB_DEFS) {
      const active = def.id === tab;
      tabButtons[def.id].classList.toggle('is-active', active);
      tabButtons[def.id].setAttribute('aria-selected', String(active));
      panels[def.id].hidden = !active;
    }
    if (tab === 'practice') renderPractice();
    const suffix = tab === 'text' ? '' : `?tab=${tab}`;
    window.history.replaceState(null, '', `#/lesson/${unit.id}${suffix}`);
  }

  container.append(
    header,
    h('div', { class: 'lesson-tabs-wrap' }, tabBar),
    h('div', { class: 'lesson-panels' }, panels.text, panels.vocab, panels.grammar, panels.practice, panels.notes),
    h('div', { class: 'lesson-footer-nav' }, navButton(prevUnit, '上一课', 'back'), navButton(nextUnit, '下一课', 'chevron')),
  );

  switchTab(state.tab);

  // ---------- 学习时长与快捷键 ----------
  let studyStart = Date.now();
  const flushStudy = () => {
    const elapsed = Math.min((Date.now() - studyStart) / 1000, 1800);
    if (elapsed > 15) store.recordStudySeconds(elapsed);
    studyStart = Date.now();
  };
  const onVisibility = () => {
    if (document.hidden) flushStudy();
    else studyStart = Date.now();
  };
  document.addEventListener('visibilitychange', onVisibility, { signal: ctx.signal });

  document.addEventListener(
    'keydown',
    (event) => {
      const target = event.target;
      const interactive =
        target instanceof HTMLElement &&
        (target.matches('input, textarea, select') ||
          target.isContentEditable ||
          Boolean(target.closest('button, a, summary')));
      if (interactive) return;

      if (state.tab === 'text') {
        if (event.code === 'Space') {
          event.preventDefault();
          if (state.playMode === 'all') stopPlayback();
          else playSentence(state.current >= 0 ? state.current : 0);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          playSentence(Math.min(unit.sentences.length - 1, state.current + 1));
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          playSentence(Math.max(0, state.current - 1));
        }
      }

      if (state.tab === 'practice') {
        const question = unit.exercises[practiceState.index];
        if (!question) return;
        if (question.kind === 'choice' && /^[1-4]$/.test(event.key) && !practiceState.submitted) {
          const index = Number(event.key) - 1;
          if (question.options[index] !== undefined) {
            event.preventDefault();
            practiceApi.select?.(index);
          }
        }
        if (event.key === 'Enter') {
          if (practiceState.submitted) practiceApi.next?.();
          else if (question.kind === 'choice') practiceApi.submit?.();
        }
      }
    },
    { signal: ctx.signal },
  );

  return () => {
    flushStudy();
    store.saveNote(unit.id, noteInput.value);
    ctx.tts.cancel();
    ctx.recorder.destroy();
    unsubscribeVoices();
  };
}
