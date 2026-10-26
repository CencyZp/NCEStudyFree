#!/usr/bin/env node
/**
 * 独立校验生成后的课程数据与站点关键文件。
 * 用法：node tools/validate-data.mjs
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXPECTED = [
  { id: 1, units: 72, lessons: 144 },
  { id: 2, units: 96, lessons: 96 },
  { id: 3, units: 60, lessons: 60 },
  { id: 4, units: 48, lessons: 48 },
];

const errors = [];
const warnings = [];

async function loadScript(relativePath) {
  const code = await readFile(path.join(ROOT, relativePath), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(code, context, { filename: relativePath });
  return context.window.NCE;
}

function check(condition, message) {
  if (!condition) errors.push(message);
}

async function main() {
  const booksNce = await loadScript('data/books.js');
  const books = booksNce?.books || [];
  check(books.length === 4, `books.js 应有 4 册，实际 ${books.length}`);
  const ids = new Set();
  const unitIds = new Set();
  let totalUnits = 0;
  let totalSentences = 0;
  let bilingual = 0;
  let totalExercises = 0;

  for (const expected of EXPECTED) {
    const book = books.find((item) => item.id === expected.id);
    check(Boolean(book), `缺少第 ${expected.id} 册元数据`);
    if (!book) continue;
    check(book.units === expected.units, `第 ${expected.id} 册 units=${book.units}，期望 ${expected.units}`);
    check(book.lessons === expected.lessons, `第 ${expected.id} 册 lessons=${book.lessons}，期望 ${expected.lessons}`);

    const nce = await loadScript(`data/book${expected.id}.js`);
    const data = nce?.booksData?.[expected.id];
    check(Boolean(data), `缺少 data/book${expected.id}.js 数据`);
    if (!data) continue;
    check(Array.isArray(data.units), `第 ${expected.id} 册 units 不是数组`);
    check(data.units.length === expected.units, `第 ${expected.id} 册实际 ${data.units.length} 个单元`);

    for (const unit of data.units) {
      check(Boolean(unit.id), `第 ${expected.id} 册存在无 id 单元`);
      check(!ids.has(unit.id), `重复单元 id：${unit.id}`);
      ids.add(unit.id);
      check(unit.book === expected.id, `${unit.id} book 字段错误`);
      check(Number.isInteger(unit.lessonFrom) && Number.isInteger(unit.lessonTo), `${unit.id} 课号不是整数`);
      check(unit.lessonTo >= unit.lessonFrom, `${unit.id} lessonTo < lessonFrom`);
      check(Boolean(unit.title), `${unit.id} 标题为空`);
      check(Array.isArray(unit.sentences) && unit.sentences.length > 0, `${unit.id} 没有课文句子`);
      totalSentences += unit.sentences.length;
      bilingual += unit.sentences.filter((sentence) => sentence.zh).length;
      check(Array.isArray(unit.exercises) && unit.exercises.length >= 4, `${unit.id} 练习题少于 4 道`);
      totalExercises += unit.exercises?.length || 0;
      if (!unit.vocab?.length) warnings.push(`${unit.id} 没有词汇`);
      if (!unit.grammar?.length) warnings.push(`${unit.id} 没有语法点`);

      for (const exercise of unit.exercises || []) {
        const exerciseId = `${unit.id}:${exercise.id}`;
        check(!unitIds.has(exerciseId), `重复练习题 id：${exerciseId}`);
        unitIds.add(exerciseId);
        check(Boolean(exercise.prompt), `${exerciseId} 题干为空`);
        check(["choice", "text"].includes(exercise.kind), `${exerciseId} kind 非法`);
        if (exercise.kind === "choice") {
          check(Array.isArray(exercise.options) && exercise.options.length >= 2, `${exerciseId} 选项不足`);
          check(Number.isInteger(exercise.answer) && exercise.answer >= 0 && exercise.answer < exercise.options.length, `${exerciseId} 答案索引越界`);
        } else {
          check(String(exercise.answer || "").trim().length > 0, `${exerciseId} 文本答案为空`);
        }
      }
    }
    totalUnits += data.units.length;
  }

  const search = await loadScript('data/search-index.js');
  check(Array.isArray(search?.searchIndex), '缺少搜索索引');
  check(search?.searchIndex?.length === totalUnits, `搜索索引 ${search?.searchIndex?.length} 条，单元 ${totalUnits}`);

  const ratio = totalSentences ? bilingual / totalSentences : 0;
  check(ratio >= 0.95, `双语覆盖率 ${(ratio * 100).toFixed(1)}% < 95%`);

  const required = [
    'index.html',
    '404.html',
    'css/styles.css',
    'js/app.js',
    'js/store.js',
    'js/srs.js',
    'js/exercises.js',
    'sw.js',
    'manifest.webmanifest',
    'assets/icons/icon-192.png',
    'assets/icons/icon-512.png',
    'assets/icons/favicon.svg',
  ];
  for (const file of required) {
    try {
      const info = await stat(path.join(ROOT, file));
      check(info.size > 0, `${file} 为空`);
    } catch {
      errors.push(`缺少文件：${file}`);
    }
  }

  console.log('=== NCE StudyFree 数据校验 ===');
  console.log(`册数：${books.length}`);
  console.log(`单元：${totalUnits}`);
  console.log(`课文句子：${totalSentences}`);
  console.log(`双语覆盖率：${(ratio * 100).toFixed(1)}%`);
  console.log(`练习题：${totalExercises}`);
  console.log(`单元 id：${ids.size}`);
  console.log(`警告：${warnings.length}`);
  for (const warning of warnings.slice(0, 10)) console.log(`  - ${warning}`);
  console.log(`错误：${errors.length}`);
  for (const error of errors) console.log(`  ✗ ${error}`);

  if (errors.length) process.exitCode = 1;
  else console.log('\n✓ 校验通过');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
