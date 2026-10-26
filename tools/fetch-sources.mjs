#!/usr/bin/env node
/**
 * 下载新概念英语 1-4 的课文 LRC 与课级学习笔记 JSON。
 *
 * 数据来源：
 *  - LRC：iChochy/NCE 静态站（https://nce.mleo.site），项目代码 MIT；
 *          课文/译文版权归原作者与出版社，仅用于个人学习。
 *  - notes：LiDuoMiao/new-concept-english（MIT），AI 辅助整理的词汇/短语/语法。
 *
 * 用法：
 *   node tools/fetch-sources.mjs            # 跳过已存在文件
 *   node tools/fetch-sources.mjs --force    # 重新下载全部
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'sources');
const NOTES_BASE = 'https://raw.githubusercontent.com/LiDuoMiao/new-concept-english/master/notes';
const BOOKS = [
  { key: 'NCE1', site: 'https://nce.mleo.site/NCE1', label: '第一册' },
  { key: 'NCE2', site: 'https://nce.mleo.site/NCE2', label: '第二册' },
  { key: 'NCE3', site: 'https://nce.mleo.site/NCE3', label: '第三册' },
  { key: 'NCE4', site: 'https://nce.mleo.site/NCE4', label: '第四册' },
];
const UA = {
  'User-Agent':
    'NCEStudyFree/1.0 (+https://github.com/CencyZp/NCEStudyFree; personal study project)',
};
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 4));
const FORCE = process.argv.includes('--force');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 从 unit.filename 推导课号：001&002 -> 001-002；01 -> 01。 */
export function unitKey(filename) {
  const match = String(filename).match(/^(\d+)(?:&(\d+))?/);
  if (!match) throw new Error(`无法解析课号：${filename}`);
  return match[2] ? `${match[1]}-${match[2]}` : match[1];
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function save(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, 'utf8');
}

async function fetchText(url, tries = 3) {
  let lastError;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: UA,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < tries - 1) await sleep(400 * 2 ** attempt);
    }
  }
  throw new Error(`${lastError?.message || '下载失败'} (${url})`);
}

async function pool(items, worker, limit) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const startedAt = new Date().toISOString();
  const manifest = {
    startedAt,
    sources: {
      lrc: 'https://nce.mleo.site/NCE{1..4}/book.json + {unit}.lrc',
      notes: 'https://raw.githubusercontent.com/LiDuoMiao/new-concept-english/master/notes',
    },
    books: [],
    totals: { books: 0, units: 0, lrcOk: 0, notesOk: 0, lrcFailed: 0, notesFailed: 0 },
  };
  const errors = [];

  for (const book of BOOKS) {
    console.log(`\n=== ${book.key} ${book.label} ===`);
    const catalogText = await fetchText(`${book.site}/book.json`);
    const catalog = JSON.parse(catalogText);
    const units = Array.isArray(catalog.units) ? catalog.units : [];
    if (!units.length) throw new Error(`${book.key} book.json 没有 units`);
    await save(path.join(SOURCE_DIR, 'books', `${book.key}.json`), catalogText);

    const entries = [];
    let done = 0;
    await pool(
      units,
      async (unit) => {
        const key = unitKey(unit.filename);
        const lrcFile = path.join(SOURCE_DIR, 'lrc', book.key, `${key}.lrc`);
        const notesFile = path.join(SOURCE_DIR, 'notes', book.key, `${key}.json`);
        const entry = {
          key,
          title: unit.title,
          filename: unit.filename,
          lrc: { ok: false, file: `sources/lrc/${book.key}/${key}.lrc` },
          notes: { ok: false, file: `sources/notes/${book.key}/${key}.json` },
        };

        try {
          let lrc;
          if (!FORCE && existsSync(lrcFile)) {
            lrc = await (await import('node:fs/promises')).readFile(lrcFile, 'utf8');
            entry.lrc.cached = true;
          } else {
            const url = `${book.site}/${encodeURIComponent(`${unit.filename}.lrc`)}`;
            lrc = await fetchText(url);
            await save(lrcFile, lrc);
            entry.lrc.url = url;
          }
          entry.lrc.ok = lrc.trim().length > 0;
          entry.lrc.bytes = Buffer.byteLength(lrc, 'utf8');
          entry.lrc.sha256 = sha256(lrc);
          if (!entry.lrc.ok) errors.push(`${book.key}/${key}: LRC 为空`);
        } catch (error) {
          errors.push(`${book.key}/${key}: LRC ${error.message}`);
        }

        try {
          let notes;
          if (!FORCE && existsSync(notesFile)) {
            notes = await (await import('node:fs/promises')).readFile(notesFile, 'utf8');
            entry.notes.cached = true;
          } else {
            const url = `${NOTES_BASE}/${book.key}/${key}.json`;
            notes = await fetchText(url);
            await save(notesFile, notes);
            entry.notes.url = url;
          }
          entry.notes.ok = notes.trim().length > 0;
          entry.notes.bytes = Buffer.byteLength(notes, 'utf8');
          entry.notes.sha256 = sha256(notes);
          if (!entry.notes.ok) errors.push(`${book.key}/${key}: notes 为空`);
        } catch (error) {
          errors.push(`${book.key}/${key}: notes ${error.message}`);
        }

        entries.push(entry);
        done += 1;
        if (done % 12 === 0 || done === units.length) {
          console.log(`  ${done}/${units.length} (${key})`);
        }
      },
      CONCURRENCY,
    );

    entries.sort((a, b) => a.key.localeCompare(b.key));
    const lrcOk = entries.filter((entry) => entry.lrc.ok).length;
    const notesOk = entries.filter((entry) => entry.notes.ok).length;
    manifest.books.push({
      key: book.key,
      label: book.label,
      site: book.site,
      units: entries.length,
      lrcOk,
      notesOk,
      entries,
    });
    manifest.totals.books += 1;
    manifest.totals.units += entries.length;
    manifest.totals.lrcOk += lrcOk;
    manifest.totals.notesOk += notesOk;
    manifest.totals.lrcFailed += entries.length - lrcOk;
    manifest.totals.notesFailed += entries.length - notesOk;
  }

  manifest.finishedAt = new Date().toISOString();
  manifest.errors = errors;
  await save(path.join(SOURCE_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log('\n=== 抓取完成 ===');
  console.log(JSON.stringify(manifest.totals, null, 2));
  if (errors.length) {
    console.log(`\n${errors.length} 个问题：`);
    for (const error of errors.slice(0, 30)) console.log(`  - ${error}`);
    if (errors.length > 30) console.log(`  ... 另有 ${errors.length - 30} 条`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
