#!/usr/bin/env node
/**
 * sb — Site Builder commands for agent skills.
 *
 *   sb.mjs <tool_name> '<json-args>'
 *   sb.mjs --list
 *   sb.mjs --help <tool_name>
 *
 * Tool names are the ones the Site Builder MCP server used, unchanged, so the
 * guidance written for them still applies verbatim.
 *
 * Pipeline, in order — the order matters:
 *   1. token guard      before parsing, so a missing token reads as a missing
 *                       token rather than a schema error
 *   2. schema validation so no handler ever sees malformed input
 *   3. editor freeze     before the handler, so the editor is frozen before any
 *                       mutation can emit an SSE event
 *   4. handler
 *   5. audit             actor: ai, the only record an agent made the change
 *   6. envelope          no exception escapes; the exit code carries the kind
 *
 * Environment:
 *   SB_TOKEN                 required for everything that touches the backend
 *   SB_BASE_URL              defaults to https://sitebuilder.xsolla.com
 *   SB_CUSTOM_URL            overrides the base URL and sets x-custom-api-target
 *   SB_STORE_URL             defaults to https://store.xsolla.com/api/v2
 *   SB_BLOCKS_SERVICE_URL    required for federated blocks; no default
 *   SB_DRY_RUN=1             perform reads, print mutations instead of sending
 *   SB_INSECURE_TLS=1        skip certificate checks (refused against prod)
 */

import { ConfigError, loadConfig, requireToken } from './lib/config.mjs';
import { EXIT, ToolError } from './lib/errors.mjs';
import { createHttp } from './lib/http.mjs';
import { createIdentity } from './lib/identity.mjs';
import { createFederatedClient } from './lib/federated.mjs';
import { createNotifier } from './lib/notify.mjs';
import { createHalt } from './lib/halt.mjs';
import { createAuditor } from './lib/audit.mjs';
import { applyDefaults, formatToolInputError, getSchema, validate } from './lib/schema.mjs';
import { getTool, isWrite, requiresToken, toolNames } from './lib/registry.mjs';

async function main(argv) {
  const [first, ...rest] = argv;

  if (!first || first === '--help' || first === '-h') {
    if (rest[0]) return printToolHelp(rest[0]);
    printUsage();
    return EXIT.OK;
  }
  if (first === '--list') {
    printList();
    return EXIT.OK;
  }

  const toolName = first;
  const tool = getTool(toolName);
  if (!tool) {
    process.stderr.write(
      `Unknown tool "${toolName}". Run --list to see what is available.\n` +
        `Tools from the MCP server that are not ported yet fail here rather than silently doing nothing.\n`
    );
    return EXIT.INVALID;
  }

  const rawArgs = parseArgs(rest);
  const cfg = loadConfig();

  // 1. Token guard, before parsing.
  if (requiresToken(toolName)) requireToken(cfg, toolName);

  // 2. Schema validation. A handler never sees malformed input.
  const schema = getSchema(toolName);
  let args = rawArgs;
  if (schema) {
    args = applyDefaults(schema, rawArgs);
    const result = validate(schema, args);
    if (!result.ok) {
      process.stderr.write(`${formatToolInputError(toolName, result.errors)}\n`);
      return EXIT.INVALID;
    }
  }

  const http = createHttp(cfg);
  const notify = createNotifier(http);
  const halt = createHalt(notify);
  const ctx = {
    cfg,
    http,
    notify,
    halt,
    identity: createIdentity(http),
    federated: createFederatedClient(cfg, http),
  };
  const audit = createAuditor(http);
  const write = isWrite(toolName);

  // 3. Editor freeze, awaited, before the handler. Fires on reads too, so the
  // backdrop covers the whole task rather than only the final mutation.
  // send_notification manages the freeze itself.
  if (toolName !== 'send_notification' && cfg.token && !cfg.dryRun) {
    await halt.freezeOnCall(args);
  }

  try {
    const output = await tool.handler(ctx, args);
    if (cfg.token && !cfg.dryRun) await audit(toolName, args, { isWrite: write });

    if (cfg.dryRun && http.dryRunLog.length) {
      output.dryRunRequests = http.dryRunLog;
    }
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return EXIT.OK;
  } catch (error) {
    if (cfg.token && !cfg.dryRun) {
      await audit(toolName, args, { isWrite: write, failure: error.message });
    }
    return report(error);
  }
}

/**
 * Args come in as a single JSON object, matching the tool schemas exactly.
 * Flags are not offered: half the inputs are nested objects, and a flag surface
 * would drift from the schemas that document them.
 */
function parseArgs(rest) {
  const joined = rest.join(' ').trim();
  if (!joined) return {};
  let parsed;
  try {
    parsed = JSON.parse(joined);
  } catch (error) {
    throw new ToolError(`Arguments must be one JSON object: ${error.message}`, {
      hint: `Example: sb.mjs get_site '{"merchantId":"1","projectId":"2","domain":"sb-xxxx-site"}'`,
    });
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ToolError('Arguments must be a JSON object, not an array or scalar.');
  }
  return parsed;
}

function report(error) {
  if (error instanceof ConfigError) {
    process.stderr.write(`${error.message}\n`);
    return EXIT.INVALID;
  }
  if (error instanceof ToolError) {
    process.stderr.write(`${error.message}\n`);
    if (error.hint) process.stderr.write(`\n${error.hint}\n`);
    if (error.data) process.stderr.write(`\n${JSON.stringify(error.data, null, 2)}\n`);
    return error.exitCode;
  }
  process.stderr.write(`Unexpected failure: ${error?.stack || error}\n`);
  return EXIT.API;
}

function printUsage() {
  process.stdout.write(
    `sb — Site Builder commands\n\n` +
      `  sb.mjs <tool_name> '<json-args>'\n` +
      `  sb.mjs --list\n` +
      `  sb.mjs --help <tool_name>\n\n` +
      `Exit codes: 0 ok · 1 rejected before sending · 2 API error · 3 partial write (needs attention)\n`
  );
}

function printList() {
  const rows = toolNames().map((name) => {
    const tool = getTool(name);
    const tags = [tool.write ? 'write' : 'read', tool.local ? 'no-token' : null]
      .filter(Boolean)
      .join(', ');
    return `  ${name.padEnd(24)} ${tool.domain.padEnd(13)} ${tags}`;
  });
  process.stdout.write(`${rows.join('\n')}\n\n${rows.length} tools ported.\n`);
}

function printToolHelp(name) {
  const tool = getTool(name);
  const schema = getSchema(name);
  if (!tool) {
    process.stderr.write(`Unknown tool "${name}".\n`);
    return EXIT.INVALID;
  }
  const lines = [`${name} — ${tool.domain}${tool.write ? ' (write)' : ' (read)'}`, ''];
  const required = new Set(schema?.required || []);
  for (const [field, spec] of Object.entries(schema?.properties || {})) {
    const type = Array.isArray(spec.type) ? spec.type.join('|') : spec.type || 'any';
    const flags = [
      required.has(field) ? 'required' : null,
      spec.default !== undefined ? `default ${JSON.stringify(spec.default)}` : null,
      spec.enum ? `one of ${spec.enum.join('|')}` : null,
    ].filter(Boolean);
    lines.push(`  ${field}: ${type}${flags.length ? `  [${flags.join(', ')}]` : ''}`);
    if (spec.description) {
      for (const chunk of wrap(spec.description, 76)) lines.push(`      ${chunk}`);
    }
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  return EXIT.OK;
}

function wrap(text, width) {
  const out = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (line && `${line} ${word}`.length > width) {
        out.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    out.push(line);
  }
  return out.filter((l) => l.length);
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.exitCode = report(error);
}
