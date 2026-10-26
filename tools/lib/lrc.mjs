/**
 * LRC 解析：兼容 `[mm:ss.xx]English | 中文` 的双语字幕。
 * 只做纯文本解析，不依赖 DOM。
 */

const TIME_TAG = /^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/;
const META_TAG = /^\[(ti|al|ar|by|offset|re|ve):(.*)\]$/i;
const AD_LINE = /(新概念英语学习软件|tysoft\.net|mp3\s*同步字幕版)/i;

export function cleanText(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeForCompare(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function splitBilingual(content) {
  const normalized = String(content).replace(/｜/g, '|');
  const parts = normalized.split('|');
  const en = cleanText(parts[0]);
  const zh = cleanText(parts.slice(1).join(' | '));
  return { en, zh };
}

function parseTimeTag(match) {
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fractionRaw = match[3] || '';
  const fraction = fractionRaw ? Number(`0.${fractionRaw.padEnd(2, '0').slice(0, 2)}`) : 0;
  return minutes * 60 + seconds + fraction;
}

/**
 * @param {string} text LRC 原文
 * @param {{fallbackTitle?: string, fallbackTitleZh?: string, extractQuestion?: boolean}} options
 */
export function parseLrc(text, options = {}) {
  const { fallbackTitle = '', fallbackTitleZh = '', extractQuestion = true } = options;
  const meta = {};
  const rows = [];

  for (const rawLine of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const metaMatch = line.match(META_TAG);
    if (metaMatch) {
      meta[metaMatch[1].toLowerCase()] = cleanText(metaMatch[2]);
      continue;
    }

    const timeMatch = line.match(TIME_TAG);
    if (!timeMatch) continue;

    const content = cleanText(timeMatch[4]);
    if (!content || AD_LINE.test(content)) continue;

    const { en, zh } = splitBilingual(content);
    if (!en) continue;
    // 部分 LRC 会在开头放分区标题 “English / 英语”
    if (/^(English|New Concept English|NCE)$/i.test(en)) continue;
    rows.push({ en, zh, t: parseTimeTag(timeMatch) });
  }

  const titleEn = cleanText(meta.ti) || cleanText(fallbackTitle);
  const titleKey = normalizeForCompare(titleEn);
  const sentences = [];
  let titleZh = cleanText(fallbackTitleZh);
  let question = '';
  let lessonNumber = null;
  let skippedInstruction = false;
  let hadInstruction = false;
  let titleRowSkipped = false;

  for (const row of rows) {
    // 课号行：Lesson 1 | 第1课
    const lessonMatch = row.en.match(/^Lesson\s+(\d+)(?:\s*[-–&]\s*(\d+))?$/i);
    if (lessonMatch) {
      lessonNumber = Number(lessonMatch[1]);
      continue;
    }

    // 标题行：与 [ti:] 或 fallbackTitle 相同。
    // 第一册的标题句常与对话首句重复（Excuse me!），只跳过第一次。
    if (titleKey && !titleRowSkipped && normalizeForCompare(row.en) === titleKey) {
      titleRowSkipped = true;
      if (!titleZh && row.zh) titleZh = row.zh;
      continue;
    }

    // 课文前的听力指令
    if (/^Listen to the tape/i.test(row.en)) {
      skippedInstruction = true;
      hadInstruction = true;
      continue;
    }

    // 听力问题：第一册紧跟在指令之后，第二至四册通常直接位于标题之后。
    if (
      !question &&
      !sentences.length &&
      (row.en.endsWith('?') || row.en.endsWith('？')) &&
      (extractQuestion || skippedInstruction)
    ) {
      question = row.en;
      skippedInstruction = false;
      continue;
    }

    sentences.push(row);
  }

  // 部分 LRC 把理解问题拆成两行，或先放一句标题回声。
  if ((extractQuestion || hadInstruction) && sentences.length >= 2) {
    const [first, second] = sentences;
    if (
      second.en.endsWith('?') &&
      /^(The word|In the text|Look at|Read|Listen to|Study)/i.test(first.en)
    ) {
      question = question || second.en;
      sentences.splice(0, 2);
    } else if (
      !question &&
      second.en.endsWith('?') &&
      !first.en.endsWith('?') &&
      `${first.en} ${second.en}`.split(/\s+/).length <= 20
    ) {
      question = `${first.en} ${second.en}`;
      sentences.splice(0, 2);
    }
  }

  if (
    question &&
    sentences.length &&
    /^(Do|Is|Are|Can|Did|Will|Would|Have|Has|Should|May|Must)\b/i.test(question) &&
    sentences[0].en.endsWith('?') &&
    /^(Why|What|Where|When|Who|How|Which)\b/i.test(sentences[0].en)
  ) {
    question = sentences[0].en;
    sentences.shift();
  }

  return {
    meta,
    title: titleEn,
    titleZh,
    question,
    lessonNumber,
    skippedInstruction,
    sentences,
  };
}
