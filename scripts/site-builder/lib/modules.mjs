/**
 * Native block metadata, snapshotted.
 *
 * @site-builder/common is not reachable from this repo, so the module list and
 * per-module version ceilings are shipped as data in modules.json. It goes
 * stale silently — regenerate it when the block catalog changes.
 *
 * Note the federated set is only four modules. The publication service catalog
 * has hundreds of entries, but create_block treats exactly these four as
 * federated; everything else must be a native module by name.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ToolError } from './errors.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

let data = null;
function meta() {
  if (!data) data = JSON.parse(readFileSync(join(HERE, 'modules.json'), 'utf8'));
  return data;
}

export const layoutModules = () => new Set(meta().layoutModules);
export const federatedModules = () => new Set(meta().federatedModules);
export const nativeModules = () => meta().nativeModules;

export function isNativeModule(module) {
  return Object.prototype.hasOwnProperty.call(nativeModules(), module);
}

export function isFederatedModule(module) {
  return federatedModules().has(module);
}

/** null means the module has no versioning concept — version 1 is always right. */
export function getLastVersion(module) {
  return nativeModules()[module]?.maxVersion ?? null;
}

/**
 * Layout blocks are site-level and auto-created with every site, so
 * create_block cannot make one. The refusal hands back the exact batch body to
 * use instead — this is a product decision, not an implementation detail.
 */
export function assertNotLayoutModule(module) {
  if (!layoutModules().has(module)) return;
  throw new ToolError(
    `"${module}" is a site-level layout block, not a page content block. ` +
      'Layout blocks (header, common-layout, side-by-side-layout) are created automatically ' +
      'with every site and cannot be added or duplicated.',
    {
      hint:
        'To read it: call list_blocks without pageId and use get_block on the id. ' +
        'To modify it: PATCH /api/merchant/{merchantId}/project/{projectId}/ui/{siteId}/batch with ' +
        '{ "req-1": { "type": "block", "id": "{blockId}", "patches": [{ "op": "replace", "path": ["values"], "value": { ... } }] } }. ' +
        'For a sidebar, use create_sidebar instead.',
    }
  );
}

export function assertKnownModule(module) {
  if (isFederatedModule(module) || isNativeModule(module)) return;
  throw new ToolError(`Unknown module "${module}".`, {
    hint: 'Call list_block_modules to see every module that can be created.',
  });
}

/**
 * A module carrying explicit versions must be created at its current maximum —
 * both a missing version and an outdated one are rejected, each naming the
 * number to use.
 */
export function resolveNativeVersion(module, version) {
  const maxVersion = getLastVersion(module);
  if (maxVersion === null) return version ?? 1;

  if (version === undefined || version === null) {
    throw new ToolError(`version is required for module "${module}" but was not provided.`, {
      hint: `Call get_block_schema first — it reports maxVersion (currently ${maxVersion}). Then pass version: ${maxVersion}.`,
    });
  }
  if (version !== maxVersion) {
    throw new ToolError(
      `version ${version} is outdated for module "${module}" (maxVersion is ${maxVersion}).`,
      { hint: `Pass version: ${maxVersion}.` }
    );
  }
  return version;
}
