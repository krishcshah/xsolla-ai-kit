import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SB = fileURLToPath(new URL('../sb.mjs', import.meta.url));

function run(args, env = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [SB, ...args],
      { env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
    );
  });
}

test('--list exits clean and covers every registered tool', async () => {
  const { code, stdout } = await run(['--list']);
  assert.equal(code, 0);
  assert.match(stdout, /create_block\s+blocks\s+write/);
  assert.match(stdout, /list_block_modules\s+blocks\s+read, no-token/);
});

test('--help renders a tool from its schema', async () => {
  const { code, stdout } = await run(['--help', 'create_block']);
  assert.equal(code, 0);
  assert.match(stdout, /module: string\s+\[required\]/);
});

test('an unported tool fails loudly instead of doing nothing', async () => {
  const { code, stderr } = await run(['create_ai_block', '{}']);
  assert.equal(code, 1);
  assert.match(stderr, /Unknown tool "create_ai_block"/);
});

test('a missing token is reported as a missing token, not a schema error', async () => {
  const { code, stderr } = await run(['get_site', '{}']);
  assert.equal(code, 1);
  assert.match(stderr, /needs a Site Builder token/);
  assert.doesNotMatch(stderr, /Invalid arguments/);
});

test('schema failures exit 1 and name every problem at once', async () => {
  const { code, stderr } = await run(['update_block', '{"merchantId":"1"}'], { SB_TOKEN: 't' });
  assert.equal(code, 1);
  assert.match(stderr, /projectId is required/);
  assert.match(stderr, /domain is required/);
  assert.match(stderr, /blockId is required/);
});

test('malformed JSON arguments are explained with an example', async () => {
  const { code, stderr } = await run(['get_site', '{not json'], { SB_TOKEN: 't' });
  assert.equal(code, 1);
  assert.match(stderr, /must be one JSON object/);
  assert.match(stderr, /Example:/);
});

test('a local tool runs with no token and no network', async () => {
  const { code, stdout } = await run(['list_block_modules']);
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.blocks.some((b) => b.module === 'gallery'));
  assert.ok(parsed.cannotCreate.some((line) => line.startsWith('header')));
});

test('get_block_schema explains a native module without contacting anything', async () => {
  const { code, stdout } = await run(['get_block_schema', '{"module":"footer"}']);
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.maxVersion, 3);
  assert.equal(parsed.versionRequired, true);
});

test('a federated module without the publication service says so', async () => {
  const { code, stderr } = await run(['get_block_schema', '{"module":"sb-daily-reward"}']);
  assert.equal(code, 1);
  assert.match(stderr, /SB_BLOCKS_SERVICE_URL/);
});

test('insecure TLS is refused against production', async () => {
  const { code, stderr } = await run(['list_sites', '{"merchantId":"1","projectId":"2"}'], {
    SB_TOKEN: 't',
    SB_INSECURE_TLS: '1',
  });
  assert.equal(code, 1);
  assert.match(stderr, /refused/);
});
