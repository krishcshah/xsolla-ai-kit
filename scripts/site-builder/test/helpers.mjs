/**
 * Test harness: a ctx built over a scripted fetch, so handlers run end to end
 * with no network. The MCP server made fetch injectable for the same reason.
 */

import { loadConfig } from '../lib/config.mjs';
import { createHttp } from '../lib/http.mjs';
import { createIdentity } from '../lib/identity.mjs';
import { createFederatedClient } from '../lib/federated.mjs';

export function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

export function errorResponse(status, body = { error: 'nope' }) {
  return { ok: false, status, text: async () => JSON.stringify(body) };
}

/**
 * @param routes array of [matcher, responder]. matcher is a substring of the
 *        URL or a predicate over ({ url, method }).
 */
export function makeContext(routes, { env = {} } = {}) {
  const calls = [];
  const remaining = [...routes];

  const fetchImpl = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push({ url, method, body: opts.body ? JSON.parse(opts.body) : undefined, headers: opts.headers });

    const index = remaining.findIndex(([matcher]) =>
      typeof matcher === 'function' ? matcher({ url, method }) : url.includes(matcher)
    );
    if (index === -1) throw new Error(`unrouted ${method} ${url}`);
    const [, responder] = remaining[index];
    if (typeof responder === 'function') return responder({ url, method });
    remaining.splice(index, 1);
    return responder;
  };

  const cfg = loadConfig({ SB_TOKEN: 'test-token', SB_BLOCKS_SERVICE_URL: 'https://blocks.test', ...env });
  const http = createHttp(cfg, { fetchImpl });
  const notified = [];
  const notify = async (target, events) => {
    notified.push({ target, events: Array.isArray(events) ? events : [events] });
    return { sent: true };
  };

  return {
    ctx: {
      cfg,
      http,
      notify,
      halt: { setHalt: async () => {}, freezeOnCall: async () => ({ fired: false }) },
      identity: createIdentity(http),
      federated: createFederatedClient(cfg, http),
    },
    calls,
    notified,
  };
}

export const SITE = {
  _id: 'landing-1',
  domain: 'sb-test-site',
  theme: { input: { primary: '#111' }, buttonBorderRadius: 0, pictureBackground: { color: '#000' } },
  pages: [{ _id: 'page-1', path: '/', name: 'Home', blocks: ['block-a', 'block-b'] }],
  blocks: [
    { _id: 'block-a', module: 'gallery', devName: 'Gallery', parent: { type: 'page', id: 'page-1' } },
    { _id: 'block-b', module: 'federated', values: { blockId: 'sb-daily-reward' }, parent: { type: 'page', id: 'page-1' } },
  ],
};

export const TARGET = { merchantId: 'm1', projectId: 'p1', domain: 'sb-test-site' };
