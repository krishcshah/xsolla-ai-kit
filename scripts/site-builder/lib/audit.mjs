/**
 * Audit trail.
 *
 * This is the only record that an agent, rather than a human, changed a
 * merchant's site. It ships to the server (POST /api/logs), not just to the
 * client, and actor: 'ai' is the field that makes AI-originated changes
 * auditable after the fact. Dropping it would silently end that trail.
 *
 * Server ingest was unconditional in the MCP server — the client log level
 * gated only what the client saw, never what shipped. Same here: local
 * verbosity is a display concern.
 *
 * `source` and `agent` keep the MCP server's values so existing log consumers
 * and any alerting on them keep matching; `client` records where the call
 * actually came from.
 */

/** The identifying subset of any tool's input, kept structured. */
const TARGET_FIELDS = ['merchantId', 'projectId', 'domain', 'pageId', 'blockId'];

export function buildAuditContext(toolName, args, { isWrite }) {
  const target = {};
  const changes = {};
  for (const [key, value] of Object.entries(args || {})) {
    if (TARGET_FIELDS.includes(key)) target[key] = value;
    else changes[key] = value;
  }
  return {
    actor: 'ai',
    agent: 'site-builder-mcp',
    client: 'xsolla-ai-kit',
    operation: toolName,
    target,
    // Writes record what was submitted; reads have nothing worth keeping.
    ...(isWrite && Object.keys(changes).length ? { changes } : {}),
  };
}

export function createAuditor(http) {
  return async function audit(toolName, args, { isWrite, failure } = {}) {
    const level = failure ? 'error' : isWrite ? 'notice' : 'info';
    const message = failure
      ? `${toolName} failed: ${failure}`
      : `${toolName} ${isWrite ? 'write' : 'read'}`;
    try {
      await http.api('/logs', {
        method: 'POST',
        body: JSON.stringify({
          level,
          message,
          source: 'mcp-server',
          tool: toolName,
          context: buildAuditContext(toolName, args, { isWrite }),
        }),
        label: `audit ${toolName}`,
      });
    } catch (error) {
      // Never let a logging failure surface to the caller.
      process.stderr.write(`warning: audit log failed (${error.message})\n`);
    }
  };
}
