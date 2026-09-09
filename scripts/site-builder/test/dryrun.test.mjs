import test from 'node:test';
import assert from 'node:assert/strict';

import { jsonResponse, makeContext, SITE, TARGET } from './helpers.mjs';
import * as sites from '../tools/sites.mjs';
import * as blocks from '../tools/blocks.mjs';

/**
 * Dry run performs reads — identity resolution needs them — and records
 * mutations instead of sending them. That makes the exact URL, headers and body
 * of a write assertable without touching a merchant.
 */
const dry = { SB_DRY_RUN: '1' };

test('a write is recorded, not sent', async () => {
  const { ctx, calls } = makeContext(
    [['structure/internal', jsonResponse(SITE)]],
    { env: dry }
  );

  await sites.update_theme(ctx, { ...TARGET, theme: { primary: '#f00' } });

  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 0, 'nothing was sent');
  assert.equal(ctx.http.dryRunLog.length, 1);

  const [recorded] = ctx.http.dryRunLog;
  assert.equal(recorded.method, 'PATCH');
  assert.match(recorded.url, /\/ui\/landing-1\/batch$/);
  assert.equal(recorded.body['update-site-theme'].patches[0].value.input.primary, '#f00');
});

test('the recorded request never carries the real token', async () => {
  const { ctx } = makeContext([['structure/internal', jsonResponse(SITE)]], { env: dry });
  await sites.update_theme(ctx, { ...TARGET, theme: { primary: '#f00' } });
  assert.equal(ctx.http.dryRunLog[0].headers.Authorization, 'Bearer <SB_TOKEN>');
  assert.equal(ctx.http.dryRunLog[0].headers['x-actor-caller'], 'mcp');
});

test('create_block stops after the create call and says why', async () => {
  const { ctx, calls } = makeContext([], { env: dry });
  const result = await blocks.create_block(ctx, {
    ...TARGET, pageId: 'page-1', module: 'gallery', version: 2,
  });

  assert.equal(result.created, 'dry-run');
  assert.equal(result.wireModule, 'gallery');
  assert.equal(calls.length, 0);
  assert.match(result.note, /needs the block id/);
  assert.equal(ctx.http.dryRunLog[0].body.block, 'gallery');
  assert.equal(ctx.http.dryRunLog[0].body.parent.id, 'page-1');
});

test('rejections still happen before anything is recorded', async () => {
  const { ctx } = makeContext([], { env: dry });
  await assert.rejects(blocks.create_block(ctx, { ...TARGET, pageId: 'p', module: 'header' }));
  assert.equal(ctx.http.dryRunLog.length, 0);
});
