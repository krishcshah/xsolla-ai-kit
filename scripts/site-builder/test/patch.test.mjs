import test from 'node:test';
import assert from 'node:assert/strict';

import { buildValuePatches, componentsPatch, expandDotNotation } from '../lib/patch.mjs';

test('dot keys expand into a nested object for validation', () => {
  assert.deepEqual(
    expandDotNotation({ 'internalBlockValues.successModal.image': 'I:abc', title: 'Hi' }),
    { internalBlockValues: { successModal: { image: 'I:abc' } }, title: 'Hi' }
  );
});

test('array indexes expand to string keys, not arrays — a known limitation', () => {
  const expanded = expandDotNotation({ 'slides.0.title': 'x' });
  assert.equal(Array.isArray(expanded.slides), false);
  assert.deepEqual(expanded, { slides: { 0: { title: 'x' } } });
});

test('patching uses the UNEXPANDED key, so one leaf changes', () => {
  assert.deepEqual(buildValuePatches({ 'internalBlockValues.successModal.image': 'I:abc' }), [
    { op: 'add', path: ['values', 'internalBlockValues', 'successModal', 'image'], value: 'I:abc' },
  ]);
});

test('op is add, so the same patch works for new and existing fields', () => {
  const [patch] = buildValuePatches({ brandNew: 1 });
  assert.equal(patch.op, 'add');
});

test('every provided key becomes its own patch', () => {
  const patches = buildValuePatches({ a: 1, 'b.c': 2 });
  assert.equal(patches.length, 2);
  assert.deepEqual(patches.map((p) => p.path), [['values', 'a'], ['values', 'b', 'c']]);
});

test('components is replaced whole, never patched per leaf', () => {
  assert.deepEqual(componentsPatch([{ id: 1 }]), {
    op: 'replace',
    path: ['components'],
    value: [{ id: 1 }],
  });
});
