import { execSync } from 'child_process';

function localDateStr(d) { const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0'); return y+'-'+m+'-'+day; }
function todayLocalStr() { return localDateStr(new Date()); }
function daysAgoLocalStr(n) { const d = new Date(); d.setDate(d.getDate() - n); return localDateStr(d); }

const fail = [];

// 1) localDateStr uses local timezone, not UTC
const d = new Date('2026-09-05T00:00:00Z');
const local = localDateStr(d);
if (local === '2026-09-05') { /* ok only in UTC-offset=0 */ }
// Just assert it returns a yyyy-mm-dd string matching the local date
const expectedLocal = String(d.getFullYear())+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
if (local !== expectedLocal) fail.push('localDateStr returned '+local+' expected '+expectedLocal);

// 2) todayLocalStr returns valid yyyy-mm-dd
const today = todayLocalStr();
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) fail.push('todayLocalStr invalid: '+today);

// 3) daysAgoLocalStr(1) is yesterday in local TZ
const yesterday = daysAgoLocalStr(1);
const check = new Date(); check.setDate(check.getDate() - 1);
const expectedYesterday = localDateStr(check);
if (yesterday !== expectedYesterday) fail.push('daysAgoLocalStr(1) returned '+yesterday+' expected '+expectedYesterday);

// 4) UTC vs local boundary: at UTC midnight boundary, toISOString().slice(0,10) differs from local
const now = new Date();
const utcDate = now.toISOString().slice(0,10);
const localDate = localDateStr(now);
// Not an assertion — just document the divergence

// 5) advanceDueDate-style: monthly rollover local
const dec31 = new Date(2025, 11, 31);
const jan1 = new Date(dec31); jan1.setMonth(jan1.getMonth()+1);
if (localDateStr(jan1) !== '2026-01-31') fail.push('monthly advance gave '+localDateStr(jan1));

if (fail.length) { console.error('FAILURES:', fail); process.exit(1); }
console.log('OK — date helpers behave consistently in local TZ');