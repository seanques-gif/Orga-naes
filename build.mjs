// Build: reassembles src/ into the single-file Orga-naes.html.
// Zero dependencies. Behavior-preserving: concatenates ordered fragments exactly.
//
// Usage:  node build.mjs
//
// SOURCE OF TRUTH is src/. Never hand-edit Orga-naes.html (this script owns it).

import { readFileSync, writeFileSync } from 'fs';
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

writeFileSync(resolve(root, 'Orga-naes.html'), out);

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('Built Orga-naes.html');
console.log(`  css: ${order.cssMain.length}+${order.cssPrint.length} modules, ${kb(cssMain.length + cssPrint.length)}`);
console.log(`  js:  ${order.script.length} modules, ${kb(script.length)}`);
console.log(`  out: ${kb(out.length)}`);
