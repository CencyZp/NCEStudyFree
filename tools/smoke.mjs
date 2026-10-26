#!/usr/bin/env node
/**
 * 浏览器冒烟测试：用系统 Edge（Playwright channel）验证路由、练习、持久化、
 * 搜索、复习/统计/设置渲染，以及 390px 移动端是否横向溢出。
 *
 * 前置：本地服务器已启动（node tools/serve.mjs）
 * 依赖：npm install（devDependency: playwright-core）
 */
import { chromium } from 'playwright-core';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173/';
const SCREENSHOTS = path.resolve(import.meta.dirname, '..', 'docs', 'screenshots');
const errors = [];
const checks = [];
let expectHttp404 = false;

function check(condition, message) {
  if (condition) checks.push(`✓ ${message}`);
  else {
    checks.push(`✗ ${message}`);
    errors.push(message);
  }
}

async function shot(page, name) {
  await page.waitForTimeout(300);
  const target = path.join(SCREENSHOTS, name);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await page.screenshot({ path: target, animations: 'disabled' });
      return;
    } catch (error) {
      // Windows 下预览/索引进程可能短暂占用 PNG
      if (attempt === 3) throw error;
      await page.waitForTimeout(600);
    }
  }
}

async function metrics(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.right > window.innerWidth + 1;
      })
      .slice(0, 8)
      .map((element) => `${element.tagName.toLowerCase()}.${String(element.className || '').replace(/\s+/g, '.')}`),
  }));
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  locale: 'zh-CN',
});
const page = await context.newPage();
await page.emulateMedia({ reducedMotion: 'reduce' });
page.on('console', (message) => {
  if (message.type() === 'error') {
    // /this-path-does-not-exist 是刻意验证 404.html 的请求
    if (expectHttp404 && /404 \(Not Found\)/.test(message.text())) return;
    errors.push(`console: ${message.text()}`);
  }
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

try {
  // 首页（桌面）
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.hero', { timeout: 15000 });
  const homeTitle = await page.locator('.hero h1').innerText();
  check(homeTitle.includes('新概念四册'), '首页渲染主标题');
  const desktopMetrics = await metrics(page);
  check(desktopMetrics.scrollWidth <= desktopMetrics.clientWidth + 1, `首页无横向溢出 (${desktopMetrics.scrollWidth}/${desktopMetrics.clientWidth})`);
  await shot(page, 'home.png');

  // 跳过导航链接：不能把 #main 当成路由
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  const skipHash = await page.evaluate(() => window.location.hash);
  const focusedId = await page.evaluate(() => document.activeElement?.id);
  check(skipHash !== '#main', '跳过链接不会触发 /main 路由');
  check(focusedId === 'main', '跳过链接聚焦主内容区');

  // 册页
  await page.goto(`${BASE}#/book/1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.unit-row', { timeout: 15000 });
  check((await page.locator('.unit-row').count()) === 72, '第一册 72 个单元全部渲染');
  await shot(page, 'book.png');

  // 课程页
  await page.goto(`${BASE}#/lesson/b1-u01`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.sentence', { timeout: 15000 });
  const lessonText = await page.locator('.lesson-panels').innerText();
  check(lessonText.includes('Excuse me!'), '课程页加载第一课课文');
  check(!/\bnull\b/.test(lessonText), '课程页不出现 null 文本');
  check((await page.locator('.sentence').count()) >= 5, '课程页逐句渲染');
  await shot(page, 'lesson.png');

  // 练习交互
  await page.locator('.tab', { hasText: '练习' }).click();
  await page.waitForSelector('.practice-card');
  await page.locator('.option').first().click();
  await page.getByRole('button', { name: '提交答案' }).click();
  await page.waitForSelector('.feedback');
  const feedback = await page.locator('.feedback').innerText();
  check(feedback.includes('正确答案'), '练习提交后显示答案与解析');
  await shot(page, 'practice.png');

  // 持久化
  await page.waitForTimeout(400);
  const progress = await page.evaluate(() => window.NCE_APP?.store?.state?.progress?.['b1-u01']);
  check(Boolean(progress?.lastVisit), '学习进度写入 localStorage');
  await page.reload({ waitUntil: 'networkidle' });
  const persisted = await page.evaluate(() => Boolean(window.NCE_APP?.store?.state?.progress?.['b1-u01']));
  check(persisted, '刷新后学习进度保留');

  // 生词 SRS：加入生词本 → 翻面 → 评分
  await page.goto(`${BASE}#/lesson/b1-u01`, { waitUntil: 'networkidle' });
  await page.locator('.tab', { hasText: '词汇' }).click();
  await page.waitForSelector('.vocab-card');
  await page.getByRole('button', { name: '加入生词本' }).first().click();
  await page.goto(`${BASE}#/review?tab=srs`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.flashcard');
  await page.locator('.flashcard').click();
  await page.waitForSelector('.grade-row:not([hidden])');
  const cardId = await page.evaluate(() => Object.keys(window.NCE_APP.store.state.srs)[0]);
  await page.keyboard.press('3');
  await page.waitForSelector('.review-done');
  check((await page.locator('.review-done').innerText()).includes('复习完'), '生词键盘评分后完成当日复习');
  const graded = await page.evaluate((id) => window.NCE_APP.store.state.srs[id], cardId);
  await page.keyboard.press('Space');
  await page.keyboard.press('1');
  await page.waitForTimeout(200);
  const afterStaleKeys = await page.evaluate((id) => window.NCE_APP.store.state.srs[id], cardId);
  check(
    graded.reps === afterStaleKeys.reps && graded.interval === afterStaleKeys.interval,
    '复习完成后快捷键不会重复评分',
  );
  await page.waitForTimeout(3000);
  await shot(page, 'review-srs.png');

  // 搜索
  await page.goto(`${BASE}#/search?q=handbag`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.search-result', { timeout: 15000 });
  check((await page.locator('.search-result').count()) > 0, '搜索结果非空');
  await page.waitForTimeout(120);
  check(
    (await page.evaluate(() => document.activeElement?.classList?.contains('search-input'))) === true,
    '搜索页自动聚焦输入框',
  );
  await shot(page, 'search.png');

  // 复习 / 统计 / 设置
  await page.goto(`${BASE}#/review`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.segmented');
  check((await page.locator('.segment').count()) === 2, '复习页两个标签');
  await shot(page, 'review.png');

  await page.goto(`${BASE}#/stats`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.stat-grid');
  check((await page.locator('.stat-card').count()) >= 4, '统计页概览卡渲染');
  await shot(page, 'stats.png');

  await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.settings-grid');
  check((await page.locator('.settings-card').count()) >= 4, '设置页分区渲染');
  await shot(page, 'settings.png');
  await page.getByRole('button', { name: '深色' }).click();
  await page.waitForTimeout(3000);
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', '深色主题应用');
  await shot(page, 'settings-dark.png');
  await page.getByRole('button', { name: '浅色' }).click();
  await page.waitForTimeout(300);

  // 未知路径由 404.html 拉回项目根
  expectHttp404 = true;
  await page.goto(`${BASE}this-path-does-not-exist`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hero', { timeout: 15000 });
  check((await page.evaluate(() => window.location.hash)) === '#/', '404 页面回到首页 hash 路由');
  expectHttp404 = false;

  // PWA 离线：等待 Service Worker 预缓存完成，断网刷新并进入课程
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
  });
  await page.waitForTimeout(800);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hero', { timeout: 15000 });
  check((await page.locator('.hero h1').innerText()).includes('新概念四册'), '断网后首页仍可加载');
  await page.goto(`${BASE}#/lesson/b1-u01`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sentence', { timeout: 15000 });
  check((await page.locator('.sentence').count()) >= 5, '断网后课程与课文数据仍可加载');
  await context.setOffline(false);

  // 移动端 390px
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.hero');
  const mobile = await metrics(page);
  check(
    mobile.scrollWidth <= mobile.clientWidth + 1,
    `移动端首页无横向溢出 (${mobile.scrollWidth}/${mobile.clientWidth})${mobile.offenders.length ? `；溢出：${mobile.offenders.join(', ')}` : ''}`,
  );
  check((await page.locator('.bottom-link').count()) === 5, '移动端底栏包含设置入口');
  await shot(page, 'home-mobile.png');

  await page.goto(`${BASE}#/lesson/b1-u01`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.sentence');
  const mobileLesson = await metrics(page);
  check(
    mobileLesson.scrollWidth <= mobileLesson.clientWidth + 1,
    `移动端课程页无横向溢出 (${mobileLesson.scrollWidth}/${mobileLesson.clientWidth})${mobileLesson.offenders.length ? `；溢出：${mobileLesson.offenders.join(', ')}` : ''}`,
  );
  await shot(page, 'lesson-mobile.png');

  // 练习页移动端
  await page.locator('.tab', { hasText: '练习' }).click();
  await page.waitForSelector('.practice-card');
  const mobilePractice = await metrics(page);
  check(mobilePractice.scrollWidth <= mobilePractice.clientWidth + 1, '移动端练习页无横向溢出');
  await shot(page, 'practice-mobile.png');

  // 慢网路由竞态：旧课程页加载完成后不能覆盖新首页，也不能改写 hash
  const raceContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
    serviceWorkers: 'block',
  });
  const racePage = await raceContext.newPage();
  await racePage.route('**/data/book1.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await racePage.goto(BASE, { waitUntil: 'networkidle' });
  await racePage.goto(`${BASE}#/lesson/b1-u01`, { waitUntil: 'domcontentloaded' });
  await racePage.waitForTimeout(120);
  await racePage.goto(BASE, { waitUntil: 'domcontentloaded' });
  await racePage.waitForSelector('.hero', { timeout: 15000 });
  await racePage.waitForTimeout(2000);
  const raceHash = await racePage.evaluate(() => window.location.hash);
  const raceLessonCount = await racePage.locator('.lesson-header').count();
  check(raceHash === '' || raceHash === '#/', `慢加载旧路由不改写首页 hash（实际 ${raceHash || '(空)'}）`);
  check(raceLessonCount === 0, '慢加载旧路由不覆盖首页');
  await raceContext.close();
} catch (error) {
  errors.push(`运行异常：${error.stack || error.message}`);
} finally {
  await browser.close();
}

console.log(checks.join('\n'));
console.log(`\n控制台/页面错误：${errors.length}`);
for (const error of errors) console.log(`  - ${error}`);
if (errors.length) process.exitCode = 1;
