// Zero-dependency static file server for Orga-naes.
// Why this exists: Google sign-in refuses to run when a page is opened with
// file:// — the app must be viewed on http://localhost. This server does only
// that: serve files from the project folder. Nothing else. No install needed.
// Usage:  npm run serve     →  http://localhost:8080
import http from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';

// NOTE: an env PORT of 0 ("auto-assign") is ignored on purpose — the printed
// address must always be the one the server actually uses.
const envPort = Number(process.env.PORT);
const PORT = envPort > 0 ? envPort : 8080;
const ROOT = process.cwd();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath.endsWith('/')) urlPath += 'index.html';

    // Resolve inside ROOT only — no folder-climbing.
    const filePath = normalize(join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found. (Tip: the app file is Orga-naes.html — try http://localhost:8080/Orga-naes.html)');
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  Orga-naes local server is running.');
  console.log('');
  console.log('  Open this address in your browser:');
  console.log('  →  http://localhost:8080/Orga-naes.html');
  console.log('');
  console.log('  Keep this window open while you use the app.');
  console.log('  To stop the server later: press Ctrl+C in this window.');
  console.log('');
});
