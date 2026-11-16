// npm run dev: builds the games, serves dist/ on your network, rebuilds when you save
// and reloads open pages (including an iPad on the same Wi-Fi).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { buildAll } from './build.mjs';

const PORT = Number(process.env.PORT) || 5173;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.bin': 'application/octet-stream', '.glb': 'model/gltf-binary', '.txt': 'text/plain' };
const clients = new Set();

async function rebuild(reason) {
  const t = performance.now();
  try {
    await buildAll({ dev: true });
    console.log(`${reason}: rebuilt in ${Math.round(performance.now() - t)} ms`);
    for (const c of clients) c.write('data: reload\n\n');
  } catch (e) {
    console.error(`${reason}: build failed\n${e.message}`); // keep serving the last good build
  }
}

await rebuild('start');

createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n'); clients.add(res); req.on('close', () => clients.delete(res));
    return;
  }
  let file = join('dist', normalize(url).replace(/^(\.\.[/\\])+/, ''));
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { /* handled below */ }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`\nHenstead:  http://localhost:${PORT}/\nCome By:   http://localhost:${PORT}/come-by/`);
  for (const list of Object.values(networkInterfaces())) for (const a of list || []) {
    if (a.family === 'IPv4' && !a.internal) console.log(`On your iPad (same Wi-Fi): http://${a.address}:${PORT}/`);
  }
  console.log('\nWatching src/ and assets/ for changes. Ctrl+C stops.\n');
});

let timer = null;
for (const dir of ['src', 'assets']) {
  watch(dir, { recursive: true }, (_e, f) => { clearTimeout(timer); timer = setTimeout(() => rebuild(`${dir}/${f}`), 120); });
}
