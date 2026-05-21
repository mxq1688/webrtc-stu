#!/usr/bin/env node
/**
 * 模拟：双人进房 -> 一方断开重连(刷新) -> 检查信令是否恢复
 */
import https from 'https';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const WebSocket = require(join(__dir, '../frontend/node_modules/ws'));

const ROOM = 'refresh-test';
const WS = 'wss://localhost:8443/ws';
const agent = new https.Agent({ rejectUnauthorized: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const logs = [];
function log(msg) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  logs.push(line);
  console.log(line);
}

function connect(label, userId, username) {
  const q = new URLSearchParams({ userId, roomId: ROOM, username, role: 'anchor' });
  const types = [];
  const ws = new WebSocket(`${WS}?${q}`, { agent });
  ws.on('open', () => log(`${label} OPEN`));
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    types.push(m.type);
    log(`${label} << ${m.type} ${m.userId || ''}`);
  });
  ws.on('close', (c) => log(`${label} CLOSE ${c}`));
  ws.on('error', (e) => log(`${label} ERR ${e.message}`));
  return { ws, types, label, userId };
}

const idA = randomUUID();
const idB = randomUUID();

log('=== 1. A 先进房 ===');
const a = connect('A', idA, 'userA');
await sleep(600);

log('=== 2. B 加入 ===');
const b = connect('B', idB, 'userB');
await sleep(1500);

log('=== 3. B 刷新(断开重连同 userId) ===');
b.ws.close(1000);
await sleep(400);
const b2 = connect('B2', idB, 'userB');
await sleep(2000);

log('=== 4. A 刷新 ===');
a.ws.close(1000);
await sleep(400);
const a2 = connect('A2', idA, 'userA');
await sleep(2000);

const summary = {
  B2_types: b2.types.join(','),
  A2_types: a2.types.join(','),
  B_refresh_ok: b2.types.includes('user-list') && b2.types.includes('user-joined'),
  A_refresh_ok: a2.types.includes('user-list'),
  A_saw_B_rejoin: a.types.includes('user-joined'),
};
log('SUMMARY ' + JSON.stringify(summary));

a.ws.readyState <= 1 && a.ws.close();
a2.ws.close(1000);
b2.ws.close(1000);
const ok = summary.B_refresh_ok && summary.A_refresh_ok && summary.A_saw_B_rejoin;
process.exit(ok ? 0 : 1);
