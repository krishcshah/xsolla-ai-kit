/**
 * Error types and exit codes.
 *
 * The MCP server's most useful property was that every error message named the
 * tool that fixes it ("call get_block_schema", "call list_block_modules"). That
 * self-correction loop is why it recovered from bad calls, so `hint` is a
 * first-class field here rather than prose folded into the message.
 */

export const EXIT = {
  OK: 0,
  INVALID: 1, // schema violation or business-rule rejection — nothing was sent
  API: 2, // the API refused or was unreachable
  PARTIAL: 3, // a multi-step write stopped half-done; state needs attention
};

export class ToolError extends Error {
  constructor(message, { exitCode = EXIT.INVALID, hint, data } = {}) {
    super(message);
    this.name = 'ToolError';
    this.exitCode = exitCode;
    this.hint = hint;
    this.data = data;
  }
}

export class ApiError extends ToolError {
  constructor(message, { status, body, hint, data } = {}) {
    super(message, { exitCode: EXIT.API, hint, data });
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * A write that completed one step and failed the next. Distinct from ApiError
 * because the caller must act: something exists in a state nothing reads.
 */
export class PartialWriteError extends ToolError {
  constructor(message, { hint, data } = {}) {
    super(message, { exitCode: EXIT.PARTIAL, hint, data });
    this.name = 'PartialWriteError';
  }
}

/** Network-level failures surface as opaque TypeErrors from fetch; unwrap them. */
export function describeHttpError(error) {
  if (!error) return 'unknown error';
  const cause = error.cause;
  const code = cause?.code || error.code;
  if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'SELF_SIGNED_CERT_IN_CHAIN') {
    return (
      `${error.message} (${code}) — the target is using a certificate this machine ` +
      'does not trust. For a non-production target, set SB_INSECURE_TLS=1.'
    );
  }
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED') {
    return `${error.message} (${code}) — check SB_BASE_URL and your network access.`;
  }
  return code ? `${error.message} (${code})` : error.message;
}
