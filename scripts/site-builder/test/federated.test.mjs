import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { mergeInternalValuesWithResources, realModuleOf } from '../lib/federated.mjs';

/** A real production default-data.json for _site-builder-classic_gallery. */
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/default-data.gallery.json', import.meta.url), 'utf8')
);

test('the fixture has the shape the merge assumes', () => {
  assert.ok(fixture.resources.mediaValues, 'resources.mediaValues');
  assert.ok(fixture.defaultData.slides.entities[0].image.startsWith('I:'));
});

test('a URL against an image-id default goes to mediaValues, NOT to the field', () => {
  const defaults = fixture.defaultData;
  const imageId = defaults.slides.entities[0].image;
  const mediaValues = { ...fixture.resources.mediaValues };

  const merged = mergeInternalValuesWithResources(
    defaults,
    { slides: { entities: { 0: { image: 'https://example.test/hero.png' } } } },
    mediaValues
  );

  // The field keeps the image id, unchanged from the default.
  assert.equal(merged.slides.entities[0].image, imageId);
  // The URL travels in the side-channel.
  assert.equal(mediaValues[imageId].src, 'https://example.test/hero.png');
});

test('a missing mediaValues entry is created with the documented defaults', () => {
  const mediaValues = {};
  const merged = mergeInternalValuesWithResources(
    { hero: 'I:brandnew' },
    { hero: 'https://example.test/a.png' },
    mediaValues
  );
  assert.equal(merged.hero, 'I:brandnew');
  assert.deepEqual(mediaValues['I:brandnew'], {
    src: 'https://example.test/a.png',
    size: 'contain',
    color: 'transparent',
    gradient: '',
  });
});

test('an existing mediaValues entry keeps its other properties', () => {
  const mediaValues = { 'I:x': { src: 'old', size: 'cover', color: 'red', gradient: 'g' } };
  mergeInternalValuesWithResources({ hero: 'I:x' }, { hero: 'https://example.test/b.png' }, mediaValues);
  assert.deepEqual(mediaValues['I:x'], {
    src: 'https://example.test/b.png',
    size: 'cover',
    color: 'red',
    gradient: 'g',
  });
});

test('a URL where the default is NOT an image id is written to the field', () => {
  const mediaValues = {};
  const merged = mergeInternalValuesWithResources(
    { link: 'https://old.test' },
    { link: 'https://new.test' },
    mediaValues
  );
  assert.equal(merged.link, 'https://new.test');
  assert.deepEqual(mediaValues, {});
});

test('non-URL values overwrite normally and defaults are preserved', () => {
  const merged = mergeInternalValuesWithResources(
    { title: 'old', keep: 'me', nested: { a: 1, b: 2 } },
    { title: 'new', nested: { b: 3 } },
    {}
  );
  assert.deepEqual(merged, { title: 'new', keep: 'me', nested: { a: 1, b: 3 } });
});

test('arrays overwrite rather than merging element-wise', () => {
  const merged = mergeInternalValuesWithResources({ tags: ['a', 'b'] }, { tags: ['c'] }, {});
  assert.deepEqual(merged.tags, ['c']);
});

test('a stored federated block reports its real module from values.blockId', () => {
  assert.equal(realModuleOf({ module: 'federated', values: { blockId: 'sb-daily-reward' } }), 'sb-daily-reward');
  assert.equal(realModuleOf({ module: 'gallery' }), 'gallery');
  assert.equal(realModuleOf({ module: 'federated', values: {} }), 'federated');
});
