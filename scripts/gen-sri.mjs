// SRI fingerprint helper (Phase C3) — fetches the pinned Firebase bundles
// from gstatic and prints ready-to-paste integrity attributes.
//
// Run this EVERY TIME the firebasejs version in src/template.html changes:
//   node scripts/gen-sri.mjs 10.12.2
// then copy the printed <script> lines into src/template.html and rebuild.
// (Manual step by design: a CDN version bump is a conscious, reviewed act.)
import { get } from 'https';
import { createHash } from 'crypto';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/gen-sri.mjs <firebasejs-version>   e.g. 10.12.2');
  process.exit(1);
}
const bundles = ['firebase-app-compat', 'firebase-auth-compat', 'firebase-database-compat'];

const fetchBuf = (url) => new Promise((resolve, reject) => {
  get(url, (res) => {
    if (res.statusCode !== 200) return reject(new Error(`${res.statusCode} for ${url}`));
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve(Buffer.concat(chunks)));
  }).on('error', reject);
});

for (const b of bundles) {
  const buf = await fetchBuf(`https://www.gstatic.com/firebasejs/${version}/${b}.js`);
  const integrity = 'sha384-' + createHash('sha384').update(buf).digest('base64');
  console.log(`<script src="https://www.gstatic.com/firebasejs/${version}/${b}.js" integrity="${integrity}" crossorigin="anonymous"></script>`);
}
