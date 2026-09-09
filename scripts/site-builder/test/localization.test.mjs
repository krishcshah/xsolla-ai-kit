import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOWED_LOCALES,
  assertLocale,
  assertLocalizationIdExists,
  collectFederatedLocalizations,
  collectNativeLocalizations,
  isLocalizedValueDescriptor,
  scopeOf,
} from '../lib/localization.mjs';
import { ToolError } from '../lib/errors.mjs';
import { errorResponse, jsonResponse, makeContext } from './helpers.mjs';

test('the locale allowlist matches the platform list', () => {
  assert.equal(ALLOWED_LOCALES.length, 27);
  assert.ok(ALLOWED_LOCALES.includes('en-US'));
  assert.ok(ALLOWED_LOCALES.includes('zh-TW'));
  assert.equal(ALLOWED_LOCALES.includes('en-GB'), false);
});

test('an unsupported locale is rejected and the options listed', () => {
  assert.throws(() => assertLocale('en-GB'), (error) => {
    assert.ok(error instanceof ToolError);
    assert.match(error.hint, /en-US/);
    return true;
  });
  assert.doesNotThrow(() => assertLocale('ja-JP'));
});

test('a descriptor is recognised only by its __type marker', () => {
  assert.equal(isLocalizedValueDescriptor({ __type: 'localized-value-descriptor' }), true);
  assert.equal(isLocalizedValueDescriptor({ localizedString: { 'en-US': 'x' } }), false);
  assert.equal(isLocalizedValueDescriptor(null), false);
});

// Text comes from the hydrated block; the id only exists in the raw one.
test('federated: text from hydrated, id from raw', () => {
  const hydrated = {
    values: {
      internalBlockValues: { translations: { title: 'k1', unused: 'k2' } },
      resources: { localizedValues: { k1: { texts: { localizedString: { 'en-US': 'Hello' }, tag: 't' } } } },
    },
  };
  const raw = { values: { resources: { localizedValues: { k1: { texts: { id: 'L:real-id', enable: true } } } } } };

  const collected = collectFederatedLocalizations(hydrated, raw);
  assert.equal(collected.length, 1, 'a key with no hydrated text is skipped');
  assert.deepEqual(collected[0], {
    field: 'title',
    localizationId: 'L:real-id',
    tag: 't',
    texts: { 'en-US': 'Hello' },
  });
});

test('native: the walk finds descriptors and reads the id at the same path', () => {
  const hydrated = {
    title: { __type: 'localized-value-descriptor', localizedString: { 'en-US': 'A' }, tag: 'tg' },
    items: [{ label: { __type: 'localized-value-descriptor', localizedString: { 'en-US': 'B' } } }],
    plain: 'not localized',
  };
  // rawRoot is the WHOLE raw block, while the path starts at ['values'] — so the
  // id is read from rawBlock.values.<same path>.
  const raw = { values: { title: { id: 'L:one' }, items: [{ label: { id: 'L:two' } }] } };

  const out = [];
  collectNativeLocalizations(hydrated, raw, ['values'], out);

  assert.deepEqual(out.map((o) => [o.field, o.localizationId]), [
    ['values.title', 'L:one'],
    ['values.items.0.label', 'L:two'],
  ]);
});

test('scope is the parent page, or null for a site-level block', () => {
  assert.equal(scopeOf({ parent: { type: 'page', id: 'page-9' } }), 'page-9');
  assert.equal(scopeOf({ parent: { type: 'block', id: 'block-1' } }), null);
  assert.equal(scopeOf({}), null);
});

// POST /localization/update upserts, so a wrong id returns updated: true while
// writing where nothing reads.
test('a localization id absent from the target scope is refused', async () => {
  const { ctx } = makeContext([
    ['localization/extract', jsonResponse({ common: { 'L:known': {} }, pages: {} })],
  ]);
  await assert.rejects(
    assertLocalizationIdExists(ctx.http, { domain: 'sb-test-site', localizationId: 'L:made-up' }),
    (error) => {
      assert.match(error.message, /common \(site-level\) scope/);
      assert.match(error.hint, /get_block_translations/);
      return true;
    }
  );
});

test('page scope is checked against that page, not against common', async () => {
  const extract = { common: { 'L:site': {} }, pages: { 'page-1': { texts: { 'L:page': {} } } } };
  const ok = makeContext([['localization/extract', jsonResponse(extract)]]);
  assert.deepEqual(
    await assertLocalizationIdExists(ok.ctx.http, { domain: 'd', localizationId: 'L:page', pageId: 'page-1' }),
    { checked: true }
  );

  const wrong = makeContext([['localization/extract', jsonResponse(extract)]]);
  await assert.rejects(
    assertLocalizationIdExists(wrong.ctx.http, { domain: 'd', localizationId: 'L:site', pageId: 'page-1' }),
    /page "page-1" scope/
  );
});

// Deliberately soft: a safety net, not a hard dependency.
test('a failing extract lets the update proceed unchecked', async () => {
  const { ctx } = makeContext([['localization/extract', () => errorResponse(503)]]);
  assert.deepEqual(
    await assertLocalizationIdExists(ctx.http, { domain: 'd', localizationId: 'L:whatever' }),
    { checked: false }
  );
});
