import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertKnownModule,
  assertNotLayoutModule,
  federatedModules,
  getLastVersion,
  isFederatedModule,
  isNativeModule,
  resolveNativeVersion,
} from '../lib/modules.mjs';
import { ToolError } from '../lib/errors.mjs';

test('the federated set is the four remote modules, not the whole catalog', () => {
  assert.deepEqual([...federatedModules()].sort(), [
    'offerwall-block', 'sb-daily-reward', 'sb-offer-chain', 'social-quests',
  ]);
  assert.equal(isFederatedModule('_site-builder-classic_gallery'), false);
});

test('native modules are recognised and versions match the metadata', () => {
  assert.equal(isNativeModule('gallery'), true);
  assert.equal(getLastVersion('footer'), 3);
  assert.equal(getLastVersion('header'), 3);
  assert.equal(getLastVersion('html'), 2);
  assert.equal(getLastVersion('hero'), null, 'hero has no versions array');
  assert.equal(getLastVersion('newStore'), null);
});

test('layout modules are refused with the batch body to use instead', () => {
  for (const module of ['header', 'common-layout', 'side-by-side-layout']) {
    assert.throws(() => assertNotLayoutModule(module), (error) => {
      assert.ok(error instanceof ToolError);
      assert.match(error.hint, /ui\/\{siteId\}\/batch/);
      return true;
    });
  }
  assert.doesNotThrow(() => assertNotLayoutModule('gallery'));
});

test('an unknown module points at list_block_modules', () => {
  assert.throws(() => assertKnownModule('nope'), (error) => {
    assert.match(error.hint, /list_block_modules/);
    return true;
  });
  assert.doesNotThrow(() => assertKnownModule('sb-daily-reward'));
});

test('a versioned module rejects a missing version and names the right one', () => {
  assert.throws(() => resolveNativeVersion('footer', undefined), (error) => {
    assert.match(error.message, /version is required/);
    assert.match(error.hint, /version: 3/);
    return true;
  });
});

test('a versioned module rejects an outdated version', () => {
  assert.throws(() => resolveNativeVersion('footer', 2), (error) => {
    assert.match(error.message, /outdated for module "footer" \(maxVersion is 3\)/);
    return true;
  });
});

test('a module without versions accepts anything and defaults to 1', () => {
  assert.equal(resolveNativeVersion('hero', undefined), 1);
  assert.equal(resolveNativeVersion('hero', 7), 7);
});

test('the exact current version is accepted', () => {
  assert.equal(resolveNativeVersion('footer', 3), 3);
});
