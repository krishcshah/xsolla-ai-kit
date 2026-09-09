/**
 * Federated (remote) blocks.
 *
 * The module name on the wire is NOT the module name you asked for: a federated
 * block is created as module "federated" at version 1, with the real module id
 * carried in values.blockId. Anything reading a block back must invert that or
 * it will validate against the wrong schema.
 *
 * The publication service is tRPC v10 over HTTP with no transformer configured,
 * so the batch wire format is plain JSON — no superjson "json" wrapper:
 *
 *   GET {blocksServiceUrl}/getBlocks?batch=1&input={"0":{"isDev":false}}
 *   → [ { "result": { "data": Block[] } } ]
 *
 * Verified against the production service: 346 blocks, every bundle on one
 * public CDN host.
 */

import { ApiError, ToolError } from './errors.mjs';
import { requireBlocksService } from './config.mjs';

const IMAGE_ID_PATTERN = /^I:[a-z0-9]+$/;

/**
 * Per-run cache. A federated create otherwise costs catalog + default-data +
 * create + structure + batch = five round-trips across three origins, and the
 * catalog and default-data are static per block version.
 */
export function createFederatedClient(cfg, http) {
  let catalog = null;
  const defaultDataCache = new Map();

  async function getCatalog() {
    if (catalog) return catalog;
    requireBlocksService(cfg, 'this module');
    const input = encodeURIComponent(JSON.stringify({ 0: { isDev: false } }));
    const url = `${cfg.blocksServiceUrl}/getBlocks?batch=1&input=${input}`;
    const { data } = await http.anon(url);
    const blocks = data?.[0]?.result?.data;
    if (!Array.isArray(blocks)) {
      throw new ApiError('Publication service returned an unexpected shape for getBlocks.', {
        hint: 'Check SB_BLOCKS_SERVICE_URL — it must point at the tRPC root, not at /getBlocks.',
      });
    }
    catalog = blocks;
    return catalog;
  }

  async function findBlock(moduleId) {
    const blocks = await getCatalog();
    const block = blocks.find((b) => b.id === moduleId);
    if (!block) {
      throw new ToolError(`Federated block "${moduleId}" is not in the publication service catalog.`, {
        hint: 'Call list_block_modules to see every module that can be created.',
      });
    }
    return block;
  }

  /** { resources, defaultData } — fetched from the bundle CDN with no headers. */
  async function getDefaultData(moduleId) {
    if (defaultDataCache.has(moduleId)) return defaultDataCache.get(moduleId);
    const block = await findBlock(moduleId);
    const url = new URL('default-data.json', ensureSlash(block.url)).toString();
    const { data } = await http.anon(url);
    const parsed = {
      block,
      resources: data?.resources ?? {},
      defaultData: data?.defaultData ?? {},
    };
    defaultDataCache.set(moduleId, parsed);
    return parsed;
  }

  async function isFederated(moduleId) {
    if (!cfg.blocksServiceUrl) return false;
    const blocks = await getCatalog();
    return blocks.some((b) => b.id === moduleId);
  }

  /** The full create_block payload for a federated module. */
  async function buildPayload(moduleId, userBlockValues) {
    const { block, resources: rawResources, defaultData } = await getDefaultData(moduleId);

    // Copy mediaValues before mutating: the merge writes image srcs into it by
    // reference and the result is read back out below.
    const resources = { ...rawResources };
    const mediaValues = { ...(resources.mediaValues ?? {}) };
    resources.mediaValues = mediaValues;

    let internalBlockValues = { ...defaultData };
    const userInternal = userBlockValues?.values?.internalBlockValues;
    if (userInternal && typeof userInternal === 'object') {
      internalBlockValues = mergeInternalValuesWithResources(defaultData, userInternal, mediaValues);
    }

    return {
      values: {
        resources,
        internalBlockValues,
        host: block.url,
        blockId: block.id,
        version: block.version,
        useAsNativeBlock: true,
      },
      devName: block.name,
      icon: block.icon ?? '',
    };
  }

  return { getCatalog, findBlock, getDefaultData, isFederated, buildPayload };
}

/**
 * The media side-channel. If the caller supplies an http(s) URL where the
 * default value is an image id ("I:xxx"), the URL is NOT written to that field.
 * Instead the id stays put and the URL goes to resources.mediaValues[id].src —
 * a different branch of the payload from the field that references it.
 *
 * Write the URL onto the field instead and the API accepts a payload that
 * renders nothing. There is no error to catch.
 */
export function mergeInternalValuesWithResources(defaults, overrides, mediaValues) {
  const result = { ...defaults };

  for (const [key, val] of Object.entries(overrides)) {
    const defaultVal = defaults[key];

    if (typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'))) {
      if (typeof defaultVal === 'string' && IMAGE_ID_PATTERN.test(defaultVal)) {
        if (!mediaValues[defaultVal]) {
          mediaValues[defaultVal] = { src: '', size: 'contain', color: 'transparent', gradient: '' };
        }
        mediaValues[defaultVal].src = val;
        result[key] = defaultVal; // unchanged from the default, on purpose
      } else {
        result[key] = val;
      }
    } else if (isPlainObject(val) && isPlainObject(defaultVal)) {
      result[key] = mergeInternalValuesWithResources(defaultVal, val, mediaValues);
    } else {
      result[key] = val;
    }
  }

  return result;
}

/** A stored block records its real module in values.blockId when federated. */
export function realModuleOf(block) {
  const raw = block?.module ?? '';
  return raw === 'federated' ? block?.values?.blockId ?? raw : raw;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function ensureSlash(url) {
  return url.endsWith('/') ? url : `${url}/`;
}
