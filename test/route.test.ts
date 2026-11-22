import assert from 'node:assert/strict';
import { test } from 'node:test';

// route.ts reads `location` when loaded: give it the dashboard of a project site
(globalThis as unknown as { location: { pathname: string } }).location = { pathname: '/chess-results/' };
const { basePath, buildPath, extraQuery, parseLegacy, parsePath } = await import('../src/route');

const B = '/chess-results/';

test('basePath strips the tournament part and keeps the folder', () => {
  assert.equal(basePath('/chess-results/'), B);
  assert.equal(basePath('/chess-results/1542962'), B);
  assert.equal(basePath('/chess-results/1542962/team/50'), B);
  assert.equal(basePath('/chess-results/demo/standings'), B);
  assert.equal(basePath('/1542962/rounds/3'), '/');
});

test('parsePath reads tab, team and round', () => {
  assert.equal(parsePath(B, B), null);
  assert.deepEqual(parsePath(`${B}1542962`, B), { demo: false, tnr: 1542962, view: 'team', snr: null, rd: null });
  assert.deepEqual(parsePath(`${B}1542962/team/50`, B), { demo: false, tnr: 1542962, view: 'team', snr: 50, rd: null });
  assert.deepEqual(parsePath(`${B}1542962/standings/`, B), { demo: false, tnr: 1542962, view: 'standings', snr: null, rd: null });
  assert.deepEqual(parsePath(`${B}1542962/rounds/4`, B), { demo: false, tnr: 1542962, view: 'rounds', snr: null, rd: 4 });
  assert.deepEqual(parsePath(`${B}demo/team/45`, B), { demo: true, tnr: 0, view: 'team', snr: 45, rd: null });
});

test('buildPath is the inverse of parsePath', () => {
  for (const p of ['1542962/team', '1542962/team/50', '1542962/standings', '1542962/rounds', '1542962/rounds/4', 'demo/team/45', 'demo/rounds/2']) {
    const r = parsePath(B + p, B)!;
    assert.equal(buildPath(r, B), B + p);
  }
});

test('old query links are understood', () => {
  assert.deepEqual(parseLegacy('?t=1542962&view=team&show=50'), { demo: false, tnr: 1542962, view: 'team', snr: 50, rd: null });
  assert.deepEqual(parseLegacy('?t=1542962&view=rounds&rd=3&show=9'), { demo: false, tnr: 1542962, view: 'rounds', snr: null, rd: 3 });
  assert.deepEqual(parseLegacy('?demo=1&view=standings'), { demo: true, tnr: 0, view: 'standings', snr: null, rd: null });
  assert.equal(parseLegacy('?team=foo'), null);
  assert.equal(parseLegacy(''), null);
});

test('extraQuery keeps only what is not part of the position', () => {
  assert.equal(extraQuery('?t=1&view=team&show=2&rd=3&demo=1&team=x'), '');
  assert.equal(extraQuery('?t=1&proxy=https%3A%2F%2Fp%2F%3Furl%3D%7Burl%7D'), '?proxy=https%3A%2F%2Fp%2F%3Furl%3D%7Burl%7D');
});
