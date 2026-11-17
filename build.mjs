// Bundles each game into one HTML page. Output in dist/:
//   index.html, come-by/index.html  full pages (GitHub Pages, any static host)
//   library/index.html              the model and UI library (design reference, not a game)
//   henstead.html, come-by.html     the same pages without a document wrapper (claude.ai artifacts)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cellipse cx='32' cy='36' rx='20' ry='25' fill='%23f6ead2' stroke='%231f2a2e' stroke-width='3'/%3E%3C/svg%3E";
const wrap = (page) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#1f2a2e">
<link rel="icon" href="${ICON}">
<style>body{margin:0}[hidden]{display:none!important}</style>
</head>
<body>
${page}</body>
</html>
`;

const games = [
  { entry: 'src/henstead.ts', page: 'src/page-farm.html', fragment: 'dist/henstead.html', full: 'dist/index.html' },
  { entry: 'src/game.ts', page: 'src/page.html', fragment: 'dist/come-by.html', full: 'dist/come-by/index.html' },
  { entry: 'src/library.ts', page: 'src/page-library.html', fragment: 'dist/library.html', full: 'dist/library/index.html' },
];

/**
 * Builds both games into dist/. With dev: true the pages are not minified, carry source maps,
 * include a snippet that reloads them when dev.mjs rebuilds, and skip the base64 copies.
 */
export async function buildAll({ dev = false } = {}) {
  const reload = dev ? `<script>new EventSource('/__reload').onmessage = () => location.reload();</script>\n` : '';
  for (const g of games) {
    const r = await build({ entryPoints: [g.entry], bundle: true, minify: !dev, sourcemap: dev ? 'inline' : false, format: 'iife', write: false, target: 'es2020', logLevel: 'silent' });
    const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
    const page = readFileSync(g.page, 'utf8') + `<script>${js}</script>\n` + reload;
    for (const f of [g.fragment, g.full]) mkdirSync(dirname(f), { recursive: true });
    writeFileSync(g.fragment, page);
    writeFileSync(g.full, wrap(page));
    if (!dev) console.log('built', g.full, (page.length / 1024) | 0, 'KB');
  }
  cpSync('assets/audio', 'dist/audio', { recursive: true });
  cpSync('assets/models', 'dist/models', { recursive: true });
  // Base64 copies of the binary model files, for hosts that serve only text and media (claude.ai artifacts).
  if (!dev) for (const f of readdirSync('dist/models')) if (/\.(bin|glb)$/.test(f)) writeFileSync(`dist/models/${f}.b64.txt`, readFileSync(`dist/models/${f}`).toString('base64'));
  writeFileSync('dist/.nojekyll', '');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await buildAll();
