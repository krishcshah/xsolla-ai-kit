/**
 * The only place a request is built. Header construction and base-URL joining
 * live here so nothing downstream re-derives auth.
 *
 * Five distinct origins are reachable:
 *   1. sb-api                  baseUrl + /api        Bearer + x-actor-caller
 *   2. preview render          baseUrl + /preview    same headers, returns HTML
 *   3. Store API               storeUrl              same headers
 *   4. publication service     blocksServiceUrl      no auth (tRPC)
 *   5. federated bundle CDN    block.url             no auth, no headers at all
 */

import { ApiError, describeHttpError } from './errors.mjs';

export function createHttp(cfg, { fetchImpl } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;

  // Process-wide, but this is a one-shot CLI, not a shell session. loadConfig()
  // has already refused this combination against production.
  if (cfg.insecureTls) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  /**
   * x-actor-caller: mcp is load-bearing — it is what makes sb-api emit editor
   * SSE events for AI-originated changes. Change the value and open editors
   * silently stop live-refreshing.
   */
  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.token ?? ''}`,
      'x-actor-caller': 'mcp',
      ...(cfg.customApiTarget ? { 'x-custom-api-target': cfg.customApiTarget } : {}),
    };
  }

  /** Mutations recorded but not sent, when SB_DRY_RUN=1. */
  const dryRunLog = [];

  async function send(url, opts = {}) {
    const {
      method = 'GET',
      body,
      auth = true,
      expect = 'json',
      throwOnError = true,
      label,
    } = opts;

    const headers = auth ? authHeaders() : undefined;
    const mutating = method !== 'GET' && method !== 'HEAD';

    if (cfg.dryRun && mutating) {
      dryRunLog.push({
        label: label || `${method} ${url}`,
        method,
        url,
        headers: headers ? redact(headers) : undefined,
        body: body === undefined ? undefined : safeParse(body),
      });
      return { ok: true, status: 200, data: DRY_RUN_RESULT, text: '', dryRun: true };
    }

    let res;
    try {
      res = await doFetch(url, {
        method,
        ...(headers ? { headers } : {}),
        ...(body === undefined ? {} : { body }),
      });
    } catch (error) {
      throw new ApiError(`${method} ${url} failed: ${describeHttpError(error)}`);
    }

    const text = await res.text();
    if (!res.ok) {
      if (!throwOnError) return { ok: false, status: res.status, text, data: null };
      throw new ApiError(`${method} ${url} returned HTTP ${res.status}: ${truncate(text)}`, {
        status: res.status,
        body: text,
        hint: res.status === 401 || res.status === 403
          ? 'SB_TOKEN may be missing, expired, or scoped to a different merchant.'
          : undefined,
      });
    }

    if (expect === 'text') return { ok: true, status: res.status, text, data: text };
    return { ok: true, status: res.status, text, data: text ? JSON.parse(text) : null };
  }

  return {
    authHeaders,
    dryRunLog,
    /** sb-api, under /api. `path` starts with a slash. */
    api: (path, opts) => send(`${cfg.apiUrl}${path}`, opts),
    /** Preview render — HTML, not JSON. */
    preview: (path, opts) => send(`${cfg.baseUrl}/preview${path}`, { ...opts, expect: 'text' }),
    /** Store API, direct. */
    store: (path, opts) => send(`${cfg.storeUrl}${path}`, opts),
    /** Any absolute URL with no credentials attached (publication service, CDN). */
    anon: (url, opts) => send(url, { ...opts, auth: false }),
    send,
  };
}

/** Marker returned in place of a real response body for a suppressed mutation. */
export const DRY_RUN_RESULT = Object.freeze({ __dryRun: true });

function redact(headers) {
  const out = { ...headers };
  if (out.Authorization) out.Authorization = 'Bearer <SB_TOKEN>';
  return out;
}

function safeParse(body) {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function truncate(text, max = 600) {
  if (typeof text !== 'string' || text.length <= max) return text;
  return `${text.slice(0, max)}… (${text.length} bytes total)`;
}
