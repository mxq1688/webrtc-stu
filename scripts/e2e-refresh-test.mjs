#!/usr/bin/env node
/**
 * 双浏览器页面模拟：进房 -> 刷新一端 -> 检查信令日志
 */
import { chromium } from 'playwright';
import { mkdirSync, appendFileSync } from 'fs';

const ROOM = 'e2e-refresh';
const BASE = process.env.BASE_URL || 'https://localhost:3000';
const LOG_FILE = '/tmp/e2e-refresh-test.log';

const log = (msg) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}\n`;
  appendFileSync(LOG_FILE, line);
  console.log(msg);
};

mkdirSync('/tmp', { recursive: true });
appendFileSync(LOG_FILE, `\n=== run ${new Date().toISOString()} ===\n`);

const launchOpts = {
  headless: true,
  args: [
    '--ignore-certificate-errors',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
};

function attachConsole(page, label) {
  page.on('console', (msg) => {
    const t = msg.text();
    if (/\[WS\]|\[WebRTC\]|信令|连接关闭|error/i.test(t)) {
      log(`${label} console: ${t}`);
    }
  });
  page.on('pageerror', (e) => log(`${label} pageerror: ${e.message}`));
}

async function joinRoom(page, label, username) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('input[placeholder*="用户名"]', username);
  await page.fill('input[placeholder*="房间"]', ROOM);
  await page.getByRole('button', { name: /加入房间/ }).click();
  await page.waitForURL(new RegExp(`/room/${ROOM}`), { timeout: 30000 });
  log(`${label} in room`);
}

async function waitSignal(page, label, pattern, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout: ${pattern}`)), timeout);
    const handler = (msg) => {
      if (pattern.test(msg.text())) {
        clearTimeout(timer);
        page.off('console', handler);
        log(`${label} saw: ${msg.text()}`);
        resolve(msg.text());
      }
    };
    page.on('console', handler);
  });
}

const browser = await chromium.launch(launchOpts);
const ctxA = await browser.newContext({ ignoreHTTPSErrors: true });
const ctxB = await browser.newContext({ ignoreHTTPSErrors: true });
const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();
attachConsole(pageA, 'A');
attachConsole(pageB, 'B');

try {
  log('1. A 创建房间');
  await pageA.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await pageA.fill('input[placeholder*="用户名"]', 'hostA');
  await pageA.fill('input[placeholder*="房间"]', ROOM);
  await pageA.getByRole('button', { name: /创建/ }).click();
  await pageA.waitForURL(new RegExp(`/room/${ROOM}`), { timeout: 30000 });
  await waitSignal(pageA, 'A', /\[WS\] connected/, 20000);

  log('2. B 加入');
  const bJoin = joinRoom(pageB, 'B', 'guestB');
  const bWs = waitSignal(pageB, 'B', /\[WS\] connected/, 20000);
  const aJoined = waitSignal(pageA, 'A', /\[WS\] user-joined/, 20000);
  await Promise.all([bJoin, bWs, aJoined]);

  await pageA.waitForTimeout(3000);
  const remoteCountA = await pageA.locator('.video-wrapper').count();
  const remoteCountB = await pageB.locator('.video-wrapper').count();
  log(`before refresh videos: A=${remoteCountA} B=${remoteCountB}`);

  log('3. 刷新 A');
  const aReloadWs = waitSignal(pageA, 'A', /\[WS\] connected/, 25000);
  await pageA.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await aReloadWs;

  await pageA.waitForTimeout(2000);
  const bRejoin = waitSignal(pageB, 'B', /\[WS\] user-joined/, 15000).catch(() => null);
  const aList = waitSignal(pageA, 'A', /\[WS\] user-list/, 15000).catch(() => null);
  await Promise.all([bRejoin, aList]);
  await pageA.waitForTimeout(5000);

  const statusA = await pageA.locator('.connection-status').textContent();
  const statusB = await pageB.locator('.connection-status').textContent();
  log(`status A: ${statusA?.trim()}`);
  log(`status B: ${statusB?.trim()}`);

  const ok =
    statusA?.includes('信令已连接') &&
    statusB?.includes('信令已连接') &&
    (statusA?.includes('远端') || statusB?.includes('远端'));

  log(ok ? 'PASS refresh test' : 'FAIL refresh test');
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  log(`FAIL: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
