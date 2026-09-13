// CSP regression gate (Phase C2) — reads only the built Orga-naes.html.
//
// Guarantees:
//   1. Exactly one CSP meta, placed in <head> (governs everything below it).
//   2. The script-src hash pin MATCHES the actual inline script bytes — a
//      stale hash would brick the whole app (script refused to execute).
//   3. No 'unsafe-inline' or 'unsafe-eval' in script-src (the whole point).
//   4. External origins stay on the audited allowlist: gstatic scripts,
//      Google Fonts stylesheets/fonts, Firebase RTDB + auth endpoints.
//   5. Every external <script src> in the artifact is covered by the policy.
//
// When this fails: fix the artifact/policy in src/ + build.mjs — do not
// weaken this test. A new origin must be a conscious, reviewed decision.
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

const html = readFileSync(new URL('../Orga-naes.html', import.meta.url), 'utf8');
const template = readFileSync(new URL('../src/template.html', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const failures = [];
const check = (name, ok) => { if (ok) pass++; else { fail++; failures.push(name); } };

// ---- 1. one CSP meta, in head, before the inline app script ------------------
const metas = [...html.matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)">/g)];
check('exactly one CSP meta', metas.length === 1);
const csp = metas[0] && metas[0][1];
const headEnd = html.indexOf('</head>');
const metaPos = html.indexOf('<meta http-equiv="Content-Security-Policy"');
const firstScript = html.indexOf('<script');
check('CSP sits in <head> before any script', metaPos > -1 && metaPos < headEnd && metaPos < firstScript);

// ---- directive parsing --------------------------------------------------------
const directives = {};
for (const part of (csp || '').split(';')) {
  const tokens = part.trim().split(/\s+/);
  if (tokens[0]) directives[tokens[0]] = tokens.slice(1);
}
const scriptSrc = directives['script-src'] || [];

// ---- 2. hash pin matches the real inline script -------------------------------
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
check('exactly one inline script', inlineScripts.length === 1);
const actualHash = "'sha256-" + createHash('sha256').update(Buffer.from(inlineScripts[0], 'utf8')).digest('base64') + "'";
check('script hash pin matches inline script bytes', scriptSrc.includes(actualHash));

// ---- 3. no unsafe script execution --------------------------------------------
check("script-src has no 'unsafe-inline'", !scriptSrc.includes("'unsafe-inline'"));
check("no 'unsafe-eval' anywhere", !(csp || '').includes("'unsafe-eval'"));
check("default-src is 'self'", (directives['default-src'] || []).join(' ') === "'self'");

// ---- 4. audited origin allowlist ----------------------------------------------
const ALLOWED = {
  'script-src': ["'self'", 'https://www.gstatic.com', actualHash],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ['https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:'],
  'connect-src': ["'self'", 'https://*.firebasedatabase.app', 'wss://*.firebasedatabase.app', 'https://*.googleapis.com', 'wss://*.firebaseio.com'],
  'frame-src': ["'self'", 'https://*.firebaseapp.com'],
  'worker-src': ["'self'"],
};
for (const [dir, expected] of Object.entries(ALLOWED)) {
  const actual = directives[dir] || [];
  check(`${dir} exactly matches audited allowlist`,
    actual.length === expected.length && expected.every(e => actual.includes(e)));
}
check('upgrade-insecure-requests present', directives['upgrade-insecure-requests'] !== undefined);

// ---- 5. every external script src is policy-covered AND SRI-pinned -----------
const externalScriptTags = [...html.matchAll(/<script\s+src="([^"]+)"([^>]*)><\/script>/g)];
check('external scripts exist (3 firebase bundles)', externalScriptTags.length === 3);
check('all external scripts are gstatic https', externalScriptTags.every(m => m[1].startsWith('https://www.gstatic.com/')));
// SRI gate (Phase C3): a CDN script without integrity = supply-chain hole.
for (const [, src, attrs] of externalScriptTags) {
  const name = src.split('/').pop();
  check(`SRI: ${name} carries sha384 integrity`, /integrity="sha384-[A-Za-z0-9+/=]{64}"/.test(attrs));
  check(`SRI: ${name} sets crossorigin=anonymous`, /crossorigin="anonymous"/.test(attrs));
}
// Template pins SRI too (not just the artifact — build must preserve it).
const tmplScriptTags = [...template.matchAll(/<script\s+src="([^"]+)"([^>]*)><\/script>/g)];
check('template: all CDN scripts carry integrity', tmplScriptTags.length === 3 && tmplScriptTags.every(m => /integrity="sha384-/.test(m[2])));

// ---- 6. template owns the policy (token present = generated, not hand-edited) --
check('template carries __ORGA_CSP__ token', template.includes('__ORGA_CSP__'));

console.log(`CSP gate: ${pass} passed, ${fail} failed`);
if (fail) { console.error('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
console.log('OK — CSP present, hash pin live, origins locked to the audited set');
process.exit(0);
