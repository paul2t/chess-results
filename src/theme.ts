// Light / dark / follow the device. The choice lives on the device; the page has data-theme="light|dark"
// when it is not "auto" (see the :root rules in style.css, and the inline script in index.html that applies it
// before the first paint).
import { store } from './dom';

export type Theme = 'auto' | 'light' | 'dark';
export const THEME_KEY = 'cr:theme';

export function getTheme(): Theme {
  const v = store.get(THEME_KEY);
  return v === 'light' || v === 'dark' ? v : 'auto';
}

const BAR = { light: '#1b3a5c', dark: '#0f1720' };

export function applyTheme(mode: Theme): void {
  const root = document.documentElement;
  if (mode === 'auto') delete root.dataset.theme; else root.dataset.theme = mode;
  // the browser's own bar: the two <meta name="theme-color"> follow the device unless a theme is chosen
  const [first, second] = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
  if (!first || !second) return;
  if (mode === 'auto') {
    first.media = '(prefers-color-scheme: light)'; first.content = BAR.light;
    second.media = '(prefers-color-scheme: dark)'; second.content = BAR.dark;
  } else {
    first.media = 'all'; first.content = BAR[mode];
    second.media = 'not all';
  }
}

export function setTheme(mode: Theme): void {
  if (mode === 'auto') store.del(THEME_KEY); else store.set(THEME_KEY, mode);
  applyTheme(mode);
}
