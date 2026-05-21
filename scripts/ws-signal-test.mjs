#!/usr/bin/env node
/** 双端信令测试 */
import https from 'https';
import { randomUUID } from 'crypto';
import WebSocket from 'ws';

const ROOM = process.argv[2] || 'demo01';
const WS_BASE = process.env.WS_URL || 'wss://localhost:8443/ws';
const agent = new https.Agent({ rejectUnauthorized: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(label, userId, username) {
  const q = new URLSearchParams({ userId, roomId: ROOM, username, role: 'anchor' });
  const messages = [];
  const ws = new WebSocket(`${WS_BASE}?${q}`, { agent });
  ws.on('open', () => console.log(`[${label}] OPEN`));
  ws.on('message', (d) => {
    const msg = JSON.parse(d.toString());
    messages.push(msg);
    console.log(`[${label}] << ${msg.type}`, msg.userId || '', msg.targetUserId || '');
  });
  ws.on('error', (e) => console.error(`[${label}] ERR`, e.message));
  ws.on('close', (c) => console.log(`[${label}] CLOSE`, c));
  return { ws, messages, label };
}

console.log('room=', ROOM);
const pc = connect('PC', randomUUID(), 'pc');
await sleep(800);
const phone = connect('Phone', randomUUID(), 'phone');
await sleep(1200);
console.log('PC types:', pc.messages.map((m) => m.type).join(','));
console.log('Phone types:', phone.messages.map((m) => m.type).join(','));
pc.ws.close(1000);
phone.ws.close(1000);
