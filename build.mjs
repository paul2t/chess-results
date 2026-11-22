// Bundles src/view.ts -> dist/view.js and copies public/ -> dist/
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

// Demo pages (generated from demo-src/, real data from the 2025 edition)
execFileSync('node', ['scripts/gen-demo.mjs'], { stdio: 'inherit' });

cpSync('public', 'dist', { recursive: true });

await build({
  entryPoints: ['src/view.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: 'es2020',
  format: 'iife',
  outfile: 'dist/view.js',
  logLevel: 'info',
});

// The page names its script and stylesheet with a version taken from their content, so a new deploy is
// picked up at once instead of after the browser's cache (GitHub Pages: 10 minutes) runs out.
const version = (file) => createHash('sha1').update(readFileSync(`dist/${file}`)).digest('hex').slice(0, 8);
const html = readFileSync('public/index.html', 'utf8')
  .replace('href="style.css"', `href="style.css?v=${version('style.css')}"`)
  .replace('src="view.js"', `src="view.js?v=${version('view.js')}"`);
if (!html.includes('style.css?v=') || !html.includes('view.js?v=')) throw new Error('index.html: script or stylesheet reference not found');
writeFileSync('dist/index.html', html);
// GitHub Pages answers unknown paths (/chess-results/1542962/team/50) with 404.html: the app itself
writeFileSync('dist/404.html', html);
