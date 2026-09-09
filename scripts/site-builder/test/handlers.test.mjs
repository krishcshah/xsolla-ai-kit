import test from 'node:test';
import assert from 'node:assert/strict';

import { errorResponse, jsonResponse, makeContext, SITE, TARGET } from './helpers.mjs';
import * as blocks from '../tools/blocks.mjs';
import * as pages from '../tools/pages.mjs';
import * as sites from '../tools/sites.mjs';
import { EXIT, PartialWriteError, ToolError } from '../lib/errors.mjs';

test('create_block places the block and reports both facts', async () => {
  const { ctx, calls } = makeContext([
    ['/blocks', jsonResponse({ block: { _id: 'new-block' } })],
    ['structure/internal', jsonResponse(SITE)],
    ['/batch', jsonResponse({ ok: true })],
  ]);

  const result = await blocks.create_block(ctx, {
    ...TARGET, pageId: 'page-1', module: 'gallery', version: 2,
  });

  assert.equal(result.created, true);
  assert.equal(result.addedToPage, true);
  assert.equal(result.blockId, 'new-block');

  const batch = calls.find((c) => c.url.includes('/batch'));
  assert.deepEqual(batch.body['page-blocks'].patches[0].value, ['block-a', 'block-b', 'new-block']);
});

test('create_block honours position', async () => {
  const { ctx, calls } = makeContext([
    ['/blocks', jsonResponse({ block: { _id: 'new-block' } })],
    ['structure/internal', jsonResponse(SITE)],
    ['/batch', jsonResponse({ ok: true })],
  ]);
  await blocks.create_block(ctx, { ...TARGET, pageId: 'page-1', module: 'gallery', version: 2, position: 1 });
  const batch = calls.find((c) => c.url.includes('/batch'));
  assert.deepEqual(batch.body['page-blocks'].patches[0].value, ['block-a', 'new-block', 'block-b']);
});

// The MCP server returned this as a SUCCESS result: created: true,
// addedToPage: false, isError: false. A caller skimming for failure moved on and
// the block stayed in the database, invisible on the page.
test('a failed placement raises a partial write, never a success', async () => {
  const { ctx, calls } = makeContext([
    ['/blocks', jsonResponse({ block: { _id: 'orphan' } })],
    ['structure/internal', () => jsonResponse(SITE)],
    ['/batch', () => errorResponse(500)],
  ]);

  await assert.rejects(
    blocks.create_block(ctx, { ...TARGET, pageId: 'page-1', module: 'gallery', version: 2 }),
    (error) => {
      assert.ok(error instanceof PartialWriteError);
      assert.equal(error.exitCode, EXIT.PARTIAL);
      assert.match(error.message, /orphan/);
      assert.equal(error.data.blockId, 'orphan');
      assert.match(error.hint, /Do not create another block/);
      return true;
    }
  );

  // Retried once before giving up.
  assert.equal(calls.filter((c) => c.url.includes('/batch')).length, 2);
});

test('create_block refuses a layout module and hands back the batch body', async () => {
  const { ctx, calls } = makeContext([]);
  await assert.rejects(
    blocks.create_block(ctx, { ...TARGET, pageId: 'page-1', module: 'header' }),
    (error) => {
      assert.match(error.hint, /ui\/\{siteId\}\/batch/);
      return true;
    }
  );
  assert.equal(calls.length, 0, 'nothing was sent');
});

test('create_block builds the federated payload and rewrites the module', async () => {
  const catalog = [{ id: 'sb-daily-reward', name: 'Daily Reward', icon: 'i', version: '1.2.3', url: 'https://cdn.test/dr/' }];
  const { ctx, calls } = makeContext([
    ['getBlocks', jsonResponse([{ result: { data: catalog } }])],
    ['default-data.json', jsonResponse({
      resources: { mediaValues: { 'I:hero': { src: '', size: 'cover' } } },
      defaultData: { hero: 'I:hero', title: 'Default' },
    })],
    ['/blocks', jsonResponse({ block: { _id: 'fed-1' } })],
    ['structure/internal', jsonResponse(SITE)],
    ['/batch', jsonResponse({ ok: true })],
  ]);

  await blocks.create_block(ctx, {
    ...TARGET,
    pageId: 'page-1',
    module: 'sb-daily-reward',
    blockValues: { values: { internalBlockValues: { hero: 'https://img.test/a.png', title: 'Mine' } } },
  });

  const create = calls.find((c) => c.url.endsWith('/blocks') && c.method === 'POST');
  assert.equal(create.body.block, 'federated', 'module on the wire is "federated"');
  assert.equal(create.body.version, 1, 'version is forced to 1');
  const values = create.body.blockValues.values;
  assert.equal(values.blockId, 'sb-daily-reward', 'the real module travels in values.blockId');
  assert.equal(values.host, 'https://cdn.test/dr/');
  assert.equal(values.useAsNativeBlock, true);
  assert.equal(values.internalBlockValues.title, 'Mine');
  assert.equal(values.internalBlockValues.hero, 'I:hero', 'the field keeps the image id');
  assert.equal(values.resources.mediaValues['I:hero'].src, 'https://img.test/a.png', 'the URL went to the side-channel');
});

test('update_block patches only the paths given', async () => {
  const { ctx, calls } = makeContext([
    ['/blocks/block-a', jsonResponse({ _id: 'block-a', module: 'gallery' })],
    ['structure/internal', jsonResponse(SITE)],
    ['/batch', jsonResponse({ ok: true })],
  ]);

  const result = await blocks.update_block(ctx, {
    ...TARGET, blockId: 'block-a', values: { 'internalBlockValues.title': 'New' },
  });

  const batch = calls.find((c) => c.url.includes('/batch'));
  assert.deepEqual(batch.body['update-block-a'], {
    type: 'block',
    id: 'block-a',
    patches: [{ op: 'add', path: ['values', 'internalBlockValues', 'title'], value: 'New' }],
  });
  assert.equal(result.module, 'gallery');
});

test('update_block resolves the real module of a federated block', async () => {
  const { ctx } = makeContext([
    ['/blocks/block-b', jsonResponse({ _id: 'block-b', module: 'federated', values: { blockId: 'sb-daily-reward' } })],
    ['structure/internal', jsonResponse(SITE)],
    ['/batch', jsonResponse({ ok: true })],
  ]);
  const result = await blocks.update_block(ctx, { ...TARGET, blockId: 'block-b', values: { title: 'x' } });
  assert.equal(result.module, 'sb-daily-reward');
});

test('update_block refuses keys that fight over the same subtree', async () => {
  const { ctx } = makeContext([
    ['/blocks/block-a', jsonResponse({ _id: 'block-a', module: 'gallery' })],
  ]);
  await assert.rejects(
    blocks.update_block(ctx, { ...TARGET, blockId: 'block-a', values: { a: 1, 'a.b': 2 } }),
    ToolError
  );
});

test('update_block with nothing to change is rejected before any request', async () => {
  const { ctx, calls } = makeContext([]);
  await assert.rejects(blocks.update_block(ctx, { ...TARGET, blockId: 'block-a' }), ToolError);
  assert.equal(calls.length, 0);
});

test('delete_block refuses without confirmation and sends nothing', async () => {
  const { ctx, calls } = makeContext([]);
  await assert.rejects(
    blocks.delete_block(ctx, { ...TARGET, blockId: 'block-a' }),
    (error) => {
      assert.match(error.hint, /not itself confirmation/);
      return true;
    }
  );
  assert.equal(calls.length, 0);
});

test('delete_block proceeds once confirmed', async () => {
  const { ctx, calls } = makeContext([['/blocks/block-a', jsonResponse({ ok: true })]]);
  const result = await blocks.delete_block(ctx, { ...TARGET, blockId: 'block-a', confirmed: true });
  assert.equal(result.deleted, true);
  assert.equal(calls[0].method, 'DELETE');
});

test('get_block hides the bulky branches and says where the id lives', async () => {
  const { ctx } = makeContext([
    ['/blocks/block-b', jsonResponse({
      _id: 'block-b',
      module: 'federated',
      values: { blockId: 'sb-daily-reward', title: 'T', resources: { big: true }, internalBlockValues: { big: true } },
    })],
  ]);
  const result = await blocks.get_block(ctx, { ...TARGET, blockId: 'block-b' });
  assert.equal(result.module, 'sb-daily-reward');
  assert.equal(result.block.values.resources, undefined);
  assert.equal(result.block.values.internalBlockValues, undefined);
  assert.deepEqual(result.block._omitted, ['values.resources', 'values.internalBlockValues']);
  assert.match(result.note, /get_block_translations/);
});

test('search_blocks matches the real module of federated blocks', async () => {
  const { ctx } = makeContext([['structure/internal', jsonResponse(SITE)]]);
  const result = await blocks.search_blocks(ctx, { ...TARGET, module: 'sb-daily-reward' });
  assert.equal(result.count, 1);
  assert.equal(result.blocks[0].id, 'block-b');
  assert.equal(result.blocks[0].pageId, 'page-1');
});

test('reorder_blocks rejects anything that is not a permutation', async () => {
  const { ctx, calls } = makeContext([['structure/internal', () => jsonResponse(SITE)]]);
  await assert.rejects(
    pages.reorder_blocks(ctx, { ...TARGET, pageId: 'page-1', blockOrder: ['block-a'] }),
    (error) => {
      assert.deepEqual(error.data.missingFromYourOrder, ['block-b']);
      return true;
    }
  );
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 0);
});

test('reorder_blocks is a no-op when the order already matches', async () => {
  const { ctx, calls } = makeContext([['structure/internal', () => jsonResponse(SITE)]]);
  const result = await pages.reorder_blocks(ctx, {
    ...TARGET, pageId: 'page-1', blockOrder: ['block-a', 'block-b'],
  });
  assert.equal(result.reordered, false);
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 0);
});

test('reorder_blocks writes the whole array through the batch endpoint', async () => {
  const { ctx, calls } = makeContext([
    ['structure/internal', () => jsonResponse(SITE)],
    ['/batch', jsonResponse({ ok: true })],
  ]);
  await pages.reorder_blocks(ctx, { ...TARGET, pageId: 'page-1', blockOrder: ['block-b', 'block-a'] });
  const batch = calls.find((c) => c.url.includes('/batch'));
  assert.equal(batch.url, 'https://sitebuilder.xsolla.com/api/merchant/m1/project/p1/ui/landing-1/batch');
  assert.deepEqual(batch.body['reorder-blocks'].patches[0].value, ['block-b', 'block-a']);
});

test('update_theme keys the batch on the site id and sends type "site"', async () => {
  const { ctx, calls } = makeContext([
    ['structure/internal', jsonResponse(SITE)],
    ['/batch', jsonResponse({ ok: true })],
  ]);
  const result = await sites.update_theme(ctx, { ...TARGET, theme: { primary: '#f00', backgroundBlur: 5 } });
  const batch = calls.find((c) => c.url.includes('/batch'));
  assert.match(batch.url, /\/ui\/landing-1\/batch$/);
  assert.equal(batch.body['update-site-theme'].type, 'site');
  const sent = batch.body['update-site-theme'].patches[0].value;
  assert.equal(sent.input.primary, '#f00');
  assert.equal(sent.backgroundBlur, 5);
  assert.equal(result.theme.backgroundBlur, 5);
});

test('update_theme with no fields is rejected before any request', async () => {
  const { ctx, calls } = makeContext([]);
  await assert.rejects(sites.update_theme(ctx, { ...TARGET, theme: {} }), ToolError);
  assert.equal(calls.length, 0);
});

test('list_sites handles both the array and the paginated shape', async () => {
  const bare = makeContext([['landings', jsonResponse([SITE])]]);
  assert.equal((await sites.list_sites(bare.ctx, { ...TARGET, limit: 10, offset: 0 })).total, 1);

  const paged = makeContext([['landings', jsonResponse({ landings: [SITE], total: 42 })]]);
  assert.equal((await sites.list_sites(paged.ctx, { ...TARGET, limit: 10, offset: 0 })).total, 42);
});

test('every sb-api request carries the SSE-triggering actor header', async () => {
  const { ctx, calls } = makeContext([['structure/internal', jsonResponse(SITE)]]);
  await ctx.identity.getStructure(TARGET);
  assert.equal(calls[0].headers['x-actor-caller'], 'mcp');
  assert.equal(calls[0].headers.Authorization, 'Bearer test-token');
});

test('the bundle CDN and publication service are called with no credentials', async () => {
  const catalog = [{ id: 'sb-daily-reward', name: 'DR', version: '1', url: 'https://cdn.test/dr/' }];
  const { ctx, calls } = makeContext([
    ['getBlocks', jsonResponse([{ result: { data: catalog } }])],
    ['default-data.json', jsonResponse({ resources: {}, defaultData: {} })],
  ]);
  await ctx.federated.getDefaultData('sb-daily-reward');
  for (const call of calls) assert.equal(call.headers, undefined, `${call.url} sent headers`);
});

test('the structure document is fetched once per run', async () => {
  const { ctx, calls } = makeContext([['structure/internal', () => jsonResponse(SITE)]]);
  await ctx.identity.getStructure(TARGET);
  await ctx.identity.landingId(TARGET);
  await ctx.identity.findPage(TARGET, 'page-1');
  assert.equal(calls.length, 1);
});
