import test from 'node:test';
import assert from 'node:assert/strict';

import { hasThemeChanges, mergeThemeChanges, themeSummary } from '../lib/theme.mjs';
import { ToolError } from '../lib/errors.mjs';

const base = () => ({
  input: { primary: '#111', text: '#222', secondary: '#333', border: '#444', overlay: '#555' },
  calculatedTheme: { derived: 'server-owned' },
  calculationType: 'xds',
  buttonBorderRadius: 4,
  backgroundBlur: 0,
  pictureBackground: { color: '#000', url: 'https://cdn.test/x.png' },
  buttons: [{ id: 'b1' }],
  fonts: ['Inter'],
});

test('hasThemeChanges only counts defined values', () => {
  assert.equal(hasThemeChanges({ primary: undefined }), false);
  assert.equal(hasThemeChanges({ primary: '#abc' }), true);
  assert.equal(hasThemeChanges(undefined), false);
});

test('input colours are merged, untouched ones carried through', () => {
  const next = mergeThemeChanges(base(), { primary: '#f00' });
  assert.equal(next.input.primary, '#f00');
  assert.equal(next.input.text, '#222');
  assert.deepEqual(next.buttons, [{ id: 'b1' }]);
  assert.deepEqual(next.fonts, ['Inter']);
  assert.equal(next.calculationType, 'xds');
});

test('the base theme is not mutated', () => {
  const original = base();
  mergeThemeChanges(original, { primary: '#f00' });
  assert.equal(original.input.primary, '#111');
});

// The MCP server passed the tool-shaped object straight into applyInput(), which
// reads `bg` and takes radius/blur from the base — so these three fields did
// nothing while the tool still reported success.
test('background maps to pictureBackground.color', () => {
  const next = mergeThemeChanges(base(), { background: '#0f0' });
  assert.equal(next.pictureBackground.color, '#0f0');
  assert.equal(next.pictureBackground.url, 'https://cdn.test/x.png', 'other background fields survive');
});

test('buttonBorderRadius and backgroundBlur actually apply', () => {
  const next = mergeThemeChanges(base(), { buttonBorderRadius: 12, backgroundBlur: 3 });
  assert.equal(next.buttonBorderRadius, 12);
  assert.equal(next.backgroundBlur, 3);
});

test('a site with no base theme is refused rather than given invented defaults', () => {
  assert.throws(() => mergeThemeChanges(undefined, { primary: '#f00' }), ToolError);
  assert.throws(() => mergeThemeChanges({}, { primary: '#f00' }), ToolError);
});

test('the summary reports primitives and never calculatedTheme', () => {
  const summary = themeSummary(base());
  assert.equal(summary.primary, '#111');
  assert.equal(summary.background, '#000');
  assert.equal(summary.buttonBorderRadius, 4);
  assert.equal('calculatedTheme' in summary, false);
});
