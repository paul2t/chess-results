// Bundles src/view.ts -> dist/view.js and copies public/ -> dist/
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
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
