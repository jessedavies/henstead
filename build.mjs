import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
for (const [entry, pageFile, out, idx] of [['src/game.ts', 'src/page.html', 'come-by', 'index'], ['src/farm.ts', 'src/page-farm.html', 'henstead', 'farm']]) {
const r = await build({ entryPoints: [entry], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020' });
const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const page = readFileSync(pageFile, 'utf8') + `<script>${js}</script>\n`;
mkdirSync('dist', { recursive: true });
writeFileSync(`dist/${out}.html`, page); // fragment for publishing
writeFileSync(`dist/${idx}.html`, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page}</body></html>`);
console.log('built', out, (page.length / 1024 | 0) + 'KB');
}

cpSync('assets/audio', 'dist/audio', { recursive: true });
