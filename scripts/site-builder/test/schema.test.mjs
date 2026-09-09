import test from 'node:test';
import assert from 'node:assert/strict';

import { applyDefaults, formatToolInputError, getSchema, validate } from '../lib/schema.mjs';
import { toolNames } from '../lib/registry.mjs';

test('every ported tool has an input schema', () => {
  for (const name of toolNames()) {
    assert.ok(getSchema(name), `${name} is in the registry but has no schema`);
  }
});

test('required fields are reported by name', () => {
  const result = validate(getSchema('get_site'), { merchantId: '1' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ['projectId is required', 'domain is required']);
});

test('type mismatches name the expected and actual type', () => {
  const result = validate(getSchema('update_block'), {
    merchantId: '1', projectId: '2', domain: 'd', blockId: 'b', values: 'nope',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e === 'values (expected object, got string)'));
});

test('minLength 1 reads as "must not be empty"', () => {
  const result = validate(getSchema('get_site'), { merchantId: '', projectId: '2', domain: 'd' });
  assert.deepEqual(result.errors, ['merchantId must not be empty']);
});

test('enums list the allowed values', () => {
  const result = validate(getSchema('send_notification'), {
    merchantId: '1', projectId: '2', domain: 'd', title: 't', palette: 'purple',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes('success'));
});

test('nested objects are validated, not waved through', () => {
  const result = validate(getSchema('update_theme'), {
    merchantId: '1', projectId: '2', domain: 'd', theme: { buttonBorderRadius: -4 },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ['theme.buttonBorderRadius must be >= 0 (got -4)']);
});

test('arrays validate their items', () => {
  const result = validate(getSchema('reorder_blocks'), {
    merchantId: '1', projectId: '2', domain: 'd', pageId: 'p', blockOrder: ['a', 7],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('blockOrder[1]')));
});

test('defaults are filled in the way the Zod parse used to', () => {
  const filled = applyDefaults(getSchema('list_sites'), { merchantId: '1', projectId: '2' });
  assert.equal(filled.limit, 10);
  assert.equal(filled.offset, 0);
});

test('valid input passes clean', () => {
  const result = validate(getSchema('get_site'), { merchantId: '1', projectId: '2', domain: 'sb-x-site' });
  assert.equal(result.ok, true);
});

test('the error line names the tool', () => {
  assert.equal(
    formatToolInputError('get_site', ['domain is required']),
    'Invalid arguments for "get_site": domain is required'
  );
});
