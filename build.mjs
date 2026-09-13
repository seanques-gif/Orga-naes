// Build: reassembles src/ into the single-file Orga-naes.html.
// Zero dependencies. Behavior-preserving: concatenates ordered fragments exactly.
//
// Usage:  node build.mjs            rebuild Orga-naes.html + refresh the pin
//         node build.mjs --check    verify-only determinism gate (zero writes):
//                                   fails if Orga-naes.html.sha256 is missing,
//                                   Orga-naes.html on disk drifted from the pin,
//                                   or src/ no longer rebuilds to the pinned bytes
//                                   (i.e. src/ changed without `npm run build`).
//
// SOURCE OF TRUTH is src/. Never hand-edit Orga-naes.html (this script owns it).

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';

const root = resolve(process.cwd());
const rd = (p) => readFileSync(resolve(root, p), 'utf8');

const order = JSON.parse(rd('src/order.json'));
const template = rd('src/template.html');

const join = (files) => files.map(rd).join('');

const cssMain = join(order.cssMain);
const cssPrint = join(order.cssPrint);
const script = join(order.script);

function inject(text, token, body) {
  if (!text.includes(token)) throw new Error(`Template is missing token ${token}`);
  return text.replace(token, () => body);
}

let out = template;
out = inject(out, '__ORGA_CSS_MAIN__', cssMain);
out = inject(out, '__ORGA_CSS_PRINT__', cssPrint);
out = inject(out, '__ORGA_SCRIPT__', script);

// ---- CSP (Phase C2) ----------------------------------------------------------
// The policy is GENERATED, not hand-written: the hash below pins the exact
// bytes of the one inline script this build produces. Any src/ change that
// alters the app script invalidates the hash -> the build's own gate and the
// test suite both fail until rebuilt. edit: nothing in this file to tune.
const inlineScripts = [...out.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (inlineScripts.length !== 1) {
  throw new Error(`CSP: expected exactly 1 inline script, found ${inlineScripts.length} — refusing to generate a wrong hash.`);
}
const scriptHashB64 = createHash('sha256').update(Buffer.from(inlineScripts[0], 'utf8')).digest('base64');
const CSP = [
  "default-src 'self'",
  // The one inline app script is hash-pinned (no 'unsafe-inline'); gstatic
  // hosts the three pinned-by-SRI Firebase compat bundles.
  `script-src 'self' https://www.gstatic.com 'sha256-${scriptHashB64}'`,
  // 'unsafe-inline' is honest necessity: the app is built on inline style
  // attributes/blocks by design (single-file, no nonce possible in static HTML).
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com data:',
  "img-src 'self' data:",
  // RTDB REST + websocket (wildcard keeps scratch/practice copies working),
  // Auth REST (identitytoolkit/securetoken under googleapis.com).
  'connect-src \'self\' https://*.firebasedatabase.app wss://*.firebasedatabase.app https://*.googleapis.com wss://*.firebaseio.com',
  // Firebase auth handshake iframe lives on <project>.firebaseapp.com.
  "frame-src 'self' https://*.firebaseapp.com",
  'worker-src \'self\'',
  'upgrade-insecure-requests',
].join('; ');
out = inject(out, '__ORGA_CSP__', CSP);

const ARTIFACT = 'Orga-naes.html';
const PIN_FILE = 'Orga-naes.html.sha256';
const sha256 = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

const checkOnly = process.argv.includes('--check');

if (checkOnly) {
  // ---- Verify-only gate: reads nothing it writes; safe on any checkout. ----
  if (!existsSync(resolve(root, PIN_FILE))) {
    console.error(`DETERMINISM GATE: ${PIN_FILE} missing. Run \`npm run build\` and commit it.`);
    process.exit(1);
  }
  const pinned = readFileSync(resolve(root, PIN_FILE), 'utf8').trim().split(/\s+/)[0];
  const diskPath = resolve(root, ARTIFACT);
  if (!existsSync(diskPath)) {
    console.error(`DETERMINISM GATE: ${ARTIFACT} is missing (pin says ${pinned.slice(0, 12)}…).`);
    process.exit(1);
  }
  const disk = sha256(readFileSync(diskPath));
  const fresh = sha256(out);
  if (disk !== pinned) {
    console.error(`DETERMINISM GATE: ${ARTIFACT} on disk does not match ${PIN_FILE}.`);
    console.error(`  pinned: ${pinned}`);
    console.error(`  disk:   ${disk}`);
    console.error('The committed artifact was edited by hand or is stale. Run `npm run build` and commit the result.');
    process.exit(1);
  }
  if (fresh !== pinned) {
    console.error(`DETERMINISM GATE: src/ no longer builds to the pinned artifact.`);
    console.error(`  pinned: ${pinned}`);
    console.error(`  rebuilt from src/: ${fresh}`);
    console.error('src/ changed without rebuilding. Run `npm run build` and commit the refreshed artifact + pin.');
    process.exit(1);
  }
  console.log(`Determinism gate: OK (pin = disk = rebuild, sha256 ${pinned.slice(0, 16)}…)`);

  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  console.log(`  css: ${order.cssMain.length}+${order.cssPrint.length} modules, ${kb(cssMain.length + cssPrint.length)}`);
  console.log(`  js:  ${order.script.length} modules, ${kb(script.length)}`);
  console.log(`  csp: inline script pinned 'sha256-${scriptHashB64.slice(0, 10)}…'`);
  console.log(`  out: ${kb(out.length)}`);
  process.exit(0);
}

writeFileSync(resolve(root, ARTIFACT), out);
writeFileSync(resolve(root, PIN_FILE), sha256(out) + '  ' + ARTIFACT + '\n');

const kb2 = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('Built Orga-naes.html');
console.log(`  css: ${order.cssMain.length}+${order.cssPrint.length} modules, ${kb2(cssMain.length + cssPrint.length)}`);
console.log(`  js:  ${order.script.length} modules, ${kb2(script.length)}`);
console.log(`  csp: inline script pinned 'sha256-${scriptHashB64.slice(0, 10)}…'`);
console.log(`  out: ${kb2(out.length)}`);
console.log(`  pin: ${PIN_FILE} (${sha256(out).slice(0, 16)}…)`);
