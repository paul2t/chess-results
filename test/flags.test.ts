import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flagOf } from '../src/flags';

test('federation codes become flags', () => {
  assert.equal(flagOf('UKR'), '🇺🇦');
  assert.equal(flagOf('fra'), '🇫🇷');
  assert.equal(flagOf(' GER '), '🇩🇪'); // FIDE's GER is ISO's DE
  assert.equal(flagOf('NED'), '🇳🇱');
  assert.equal(flagOf('SUI'), '🇨🇭');
  assert.equal(flagOf('EUF'), '🇪🇺');
  assert.equal(flagOf('ENG'), '🏴󠁧󠁢󠁥󠁮󠁧󠁿');
  assert.equal(flagOf('SCO'), '🏴󠁧󠁢󠁳󠁣󠁴󠁿');
});

test('unknown codes and empty cells are left alone', () => {
  assert.equal(flagOf('XYZ'), 'XYZ');
  assert.equal(flagOf(''), '');
});
