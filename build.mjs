// Bundles src/view.ts -> dist/view.js and copies public/ -> dist/
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

// Demo pages (generated from demo-src/, real data from the 2025 edition)
execFileSync('node', ['scripts/gen-demo.mjs'], { stdio: 'inherit' });

cpSync('public', 'dist', { recursive: true });
// GitHub Pages answers unknown paths (/chess-results/1542962/team/50) with 404.html: the app itself
cpSync('public/index.html', 'dist/404.html');

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
