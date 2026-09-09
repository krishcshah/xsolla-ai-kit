/**
 * blocks — the domain where a naive port silently produces wrong output.
 *
 * Three things carry the risk: federated payload construction, the media
 * side-channel inside it, and the fact that create is two calls with a visible
 * orphan between them.
 */

import { PartialWriteError, ToolError } from '../lib/errors.mjs';
import { blockSummary, blockWithoutBulk } from '../lib/trim.mjs';
import { batchBody, blockEntry, buildValuePatches, componentsPatch } from '../lib/patch.mjs';
import { realModuleOf } from '../lib/federated.mjs';
import { idOf } from '../lib/identity.mjs';
import {
  assertKnownModule,
  assertNotLayoutModule,
  federatedModules,
  getLastVersion,
  isFederatedModule,
  nativeModules,
  resolveNativeVersion,
} from '../lib/modules.mjs';
import {
  collectFederatedLocalizations,
  collectNativeLocalizations,
  scopeOf,
} from '../lib/localization.mjs';

export async function list_blocks(ctx, args) {
  const { pageId, limit = 50 } = args;
  const site = await ctx.identity.getStructure(args);
  const byId = new Map((site.blocks || []).map((b) => [idOf(b), b]));

  let ids;
  if (pageId) {
    ids = await ctx.identity.pageBlockIds(args, pageId);
  } else {
    ids = [...byId.keys()];
  }

  const blocks = ids
    .slice(0, limit)
    .map((id) => {
      const block = byId.get(id);
      return block
        ? { ...blockSummary(block, { module: realModuleOf(block) }), parent: block.parent?.type ?? null }
        : { id, missing: true };
    });

  return { domain: args.domain, pageId: pageId ?? null, count: blocks.length, total: ids.length, blocks };
}

export async function get_block(ctx, args) {
  const { merchantId, projectId, domain, blockId } = args;
  const { data } = await ctx.http.api(
    `/merchant/${merchantId}/project/${projectId}/landing/${domain}/blocks/${blockId}`
  );
  const block = data?.data ?? data;
  return {
    blockId,
    // A stored federated block reports module "federated"; the real module is
    // in values.blockId. Read it back wrong and you validate against the wrong
    // schema.
    module: realModuleOf(block),
    block: blockWithoutBulk(block),
    note:
      'values.resources and values.internalBlockValues are omitted — they dominate the payload. ' +
      'localizationId is stripped by this endpoint: use get_block_translations to get it.',
  };
}

export async function search_blocks(ctx, args) {
  const { module, limit = 20 } = args;
  const site = await ctx.identity.getStructure(args);
  const matches = (site.blocks || [])
    .filter((b) => realModuleOf(b) === module)
    .slice(0, limit);

  const pages = new Map();
  for (const page of site.pages || []) {
    for (const id of (page.blocks || []).map(idOf)) pages.set(id, idOf(page));
  }

  return {
    domain: args.domain,
    module,
    count: matches.length,
    blocks: matches.map((b) => ({
      ...blockSummary(b, { module }),
      pageId: pages.get(idOf(b)) ?? null,
    })),
  };
}

export async function list_block_modules(ctx) {
  const native = Object.entries(nativeModules())
    .filter(([, m]) => m.creatable)
    .map(([module, m]) => ({ module, uiName: m.uiName, maxVersion: m.maxVersion }));

  // Names come from the publication service when it is configured; the module
  // ids themselves are known without it.
  const federated = await federatedList(ctx);

  return {
    blocks: [...native, ...federated],
    cannotCreate: [
      'header — auto-created with every site; modify via the batch API',
      'common-layout — auto-created with every site',
      'side-by-side-layout — auto-created with every site',
      'sidebar — use create_sidebar instead',
      'store — deprecated, use newStore',
    ],
  };
}

async function federatedList(ctx) {
  const ids = [...federatedModules()];
  if (!ctx.cfg.blocksServiceUrl) {
    return ids.map((module) => ({ module, uiName: module, federated: true, catalog: 'unavailable' }));
  }
  try {
    const catalog = await ctx.federated.getCatalog();
    const names = new Map(catalog.map((b) => [b.id, b.name]));
    return ids.map((module) => ({
      module,
      uiName: names.get(module) ?? module,
      federated: true,
    }));
  } catch {
    return ids.map((module) => ({ module, uiName: module, federated: true, catalog: 'unavailable' }));
  }
}

export async function get_block_schema(ctx, args) {
  const { module } = args;
  assertKnownModule(module);

  if (isFederatedModule(module)) {
    const { block, defaultData, resources } = await ctx.federated.getDefaultData(module);
    return {
      module,
      federated: true,
      version: block.version,
      host: block.url,
      // The shipped defaults ARE the schema for a federated block: pass a
      // subset of this tree as blockValues.values.internalBlockValues.
      defaultData,
      localizedValueKeys: Object.keys(resources?.localizedValues ?? {}),
      mediaValueIds: Object.keys(resources?.mediaValues ?? {}),
      note:
        'Any field whose default is an image id ("I:xxx") takes an image id, not a URL. ' +
        'Pass an http(s) URL and it is routed to resources.mediaValues[id].src automatically.',
    };
  }

  const maxVersion = getLastVersion(module);
  return {
    module,
    federated: false,
    maxVersion,
    versionRequired: maxVersion !== null,
    note:
      maxVersion === null
        ? 'This module has no versioning concept — version 1 is always correct.'
        : `create_block must pass version: ${maxVersion} exactly.`,
    valuesSchema: null,
    schemaNote:
      'Field-level schemas live in @site-builder/common, which is not available here, so values ' +
      'are not validated locally for native modules — the API rejects a bad payload instead. ' +
      'Call get_block on an existing block of this module to see the real field shape.',
  };
}

export async function get_block_translations(ctx, args) {
  const { merchantId, projectId, domain, blockId, locales, filter } = args;

  // Two sources, in parallel. /blocks/{id} hydrates the text but strips the
  // localization id; structure/internal keeps the id but not the text.
  const [hydratedRes, site] = await Promise.all([
    ctx.http.api(`/merchant/${merchantId}/project/${projectId}/landing/${domain}/blocks/${blockId}`),
    ctx.identity.getStructure(args),
  ]);

  const hydrated = hydratedRes.data?.data ?? hydratedRes.data;
  const rawBlock = (site.blocks || []).find((b) => idOf(b) === String(blockId));
  if (!rawBlock) {
    throw new ToolError(`Block "${blockId}" is not on site "${domain}".`, {
      hint: 'Call list_blocks or search_blocks to enumerate blocks.',
    });
  }

  const pageId = scopeOf(rawBlock);
  const isFederated = (rawBlock.module ?? hydrated?.module) === 'federated';

  const collected = [];
  if (isFederated) {
    collected.push(...collectFederatedLocalizations(hydrated, rawBlock));
  } else {
    collectNativeLocalizations(hydrated?.values, rawBlock, ['values'], collected);
    collectNativeLocalizations(hydrated?.components, rawBlock, ['components'], collected);
  }

  const translations = collected
    .filter(({ field }) => !filter || field.startsWith(filter))
    .map(({ field, localizationId, tag, texts }) => ({
      field,
      localizationId,
      tag,
      texts:
        locales && locales.length
          ? Object.fromEntries(locales.filter((l) => l in texts).map((l) => [l, texts[l]]))
          : texts,
    }));

  return {
    blockId,
    module: realModuleOf(rawBlock),
    pageId,
    count: translations.length,
    translations,
    note:
      'Pass localizationId, locale, value and pageId to update_localization. ' +
      'pageId null means site-level (common) scope — omit pageId in that case. ' +
      'Native blocks do not use update_localization at all: patch the ' +
      'LocalizedValueDescriptor through update_block instead.',
  };
}

/**
 * create_block is TWO calls: POST .../blocks creates the document, then a batch
 * PATCH appends the id to page.blocks. The block is not on the page until the
 * second one lands.
 *
 * The MCP server reported a failed second step as a SUCCESS result
 * (created: true, addedToPage: false, isError: false), so a caller skimming for
 * failure moved on and the block stayed invisible in the database. Here the
 * second step is retried once and then raised as a partial write, and both
 * steps live in one command so an interrupted run cannot leave the orphan as
 * the default outcome.
 */
export async function create_block(ctx, args) {
  const { merchantId, projectId, domain, pageId, module, blockValues, position } = args;

  assertNotLayoutModule(module);
  assertKnownModule(module);

  let wireModule = module;
  let wireVersion;
  let wireValues = blockValues;

  if (isFederatedModule(module)) {
    // On the wire this is module "federated" at version 1; the real module id
    // travels in values.blockId.
    wireValues = await ctx.federated.buildPayload(module, blockValues);
    wireModule = 'federated';
    wireVersion = 1;
  } else {
    wireVersion = resolveNativeVersion(module, args.version);
  }

  const created = await ctx.http.api(
    `/merchant/${merchantId}/project/${projectId}/landing/${domain}/blocks`,
    {
      method: 'POST',
      body: JSON.stringify({
        block: wireModule,
        version: wireVersion,
        parent: { type: 'page', id: pageId },
        ...(wireValues ? { blockValues: wireValues } : {}),
      }),
      label: `create ${module} block on page ${pageId}`,
    }
  );

  if (created.dryRun) {
    return {
      created: 'dry-run',
      module,
      wireModule,
      wireVersion,
      note: 'The placement PATCH is not shown: it needs the block id the create call would return.',
    };
  }

  const blockId = created.data?.block?._id ?? created.data?._id;
  if (!blockId) {
    throw new PartialWriteError('The create call succeeded but returned no block id.', {
      hint: 'Call list_blocks to find the block and place it, or remove it.',
      data: { module, pageId },
    });
  }

  const place = () => placeOnPage(ctx, args, blockId, position);

  let placed = await place();
  if (!placed.ok) {
    placed = await place(); // one retry: the read-modify-write below can lose a race
  }

  if (!placed.ok) {
    throw new PartialWriteError(
      `Block ${blockId} was created but could not be added to page ${pageId} (${placed.reason}). ` +
        'It exists as an orphan: present in the database, absent from the page.',
      {
        hint:
          `Retry placement with reorder_blocks once the page is readable, or delete_block ${blockId}. ` +
          'Do not create another block — you would end up with two.',
        data: { blockId, module, domain, pageId },
      }
    );
  }

  // The API response is discarded on purpose: a federated block carries full
  // resources/internalBlockValues, around 150 KB, and this output lands in a
  // context window.
  return {
    created: true,
    addedToPage: true,
    blockId,
    module,
    domain,
    pageId,
    note: 'Created through the API, so server-side transforms (localization, defaults, UUIDs) all ran. The editor refreshes over SSE.',
  };
}

/**
 * Read-modify-write on the whole page.blocks array — the same thing the editor
 * does. A concurrent human edit between the read and the write is silently
 * clobbered; narrowing this patch would need an index-addressed path the API
 * does not expose.
 */
async function placeOnPage(ctx, args, blockId, position) {
  const { merchantId, projectId } = args;
  try {
    const site = await ctx.identity.getStructure(args, { refresh: true });
    const landingId = String(site._id);
    const current = await ctx.identity.pageBlockIds(args, args.pageId);

    const insertAt = typeof position === 'number' ? Math.min(position, current.length) : current.length;
    const next = [...current.slice(0, insertAt), blockId, ...current.slice(insertAt)];

    const res = await ctx.http.api(
      `/merchant/${merchantId}/project/${projectId}/ui/${landingId}/batch`,
      {
        method: 'PATCH',
        throwOnError: false,
        body: JSON.stringify(
          batchBody({
            'page-blocks': {
              type: 'page',
              id: args.pageId,
              patches: [{ op: 'replace', path: ['blocks'], value: next }],
            },
          })
        ),
        label: `place block ${blockId} on page ${args.pageId}`,
      }
    );

    return res.ok ? { ok: true } : { ok: false, reason: `batch PATCH returned HTTP ${res.status}` };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export async function update_block(ctx, args) {
  const { merchantId, projectId, domain, blockId, values, components } = args;

  if (values === undefined && components === undefined) {
    throw new ToolError('At least one of values or components must be provided.');
  }

  // Preflight the block itself. A batch patch names its target by id, so a
  // wrong id is another write that can look like it worked; reading the block
  // first turns that into a clear error. It also resolves the real module,
  // since a federated block reports "federated" and keeps its true module in
  // values.blockId.
  let module = null;
  if (values !== undefined) {
    const { data } = await ctx.http.api(
      `/merchant/${merchantId}/project/${projectId}/landing/${domain}/blocks/${blockId}`
    );
    module = realModuleOf(data?.data ?? data);

    // Field-level validation is not ported. Native schemas live in
    // @site-builder/common, which is unreachable here, and the federated
    // structural walk was a known-inadequate stopgap that missed required
    // fields, enums and array item shapes whenever defaults were empty. The API
    // rejects a malformed payload instead.
    //
    // What is still checked locally: contradictory keys, which would otherwise
    // become two patches that fight over the same subtree.
    assertNoConflictingKeys(values);
  }

  const patches = [
    ...(values !== undefined ? buildValuePatches(values) : []),
    ...(components !== undefined ? [componentsPatch(components)] : []),
  ];

  const site = await ctx.identity.getStructure(args);
  const landingId = String(site._id);

  await ctx.http.api(`/merchant/${merchantId}/project/${projectId}/ui/${landingId}/batch`, {
    method: 'PATCH',
    body: JSON.stringify(batchBody({ [`update-${blockId}`]: blockEntry(blockId, patches) })),
    label: `update block ${blockId}`,
  });

  return {
    updated: true,
    blockId,
    ...(module ? { module } : {}),
    patched: patches.map((p) => p.path.join('.')),
    note: 'Only the listed paths changed. The editor refreshes over SSE.',
  };
}

/**
 * "title" and "title.text" in one call compile to two patches whose order
 * decides the outcome. Expanding shows the collision; refuse instead.
 */
function assertNoConflictingKeys(values) {
  const keys = Object.keys(values);
  for (const a of keys) {
    for (const b of keys) {
      if (a !== b && b.startsWith(`${a}.`)) {
        throw new ToolError(`values contains both "${a}" and "${b}", which patch the same subtree.`, {
          hint: `Pass one or the other: "${a}" replaces the whole subtree, "${b}" changes that one leaf.`,
        });
      }
    }
  }
}

/**
 * Deletion is gated. `confirmed` existed in the MCP schema but nothing checked
 * that a human had actually answered, so the rule lived only in prose. Here the
 * flag is enforced.
 */
export async function delete_block(ctx, args) {
  const { merchantId, projectId, domain, blockId, confirmed } = args;

  if (confirmed !== true) {
    throw new ToolError(`Refusing to delete block ${blockId} without confirmation.`, {
      hint:
        'Show the user what will be deleted — call get_block first — and ask them directly. ' +
        'Re-run with confirmed: true only after they answer. A request to "delete X" is not itself confirmation.',
    });
  }

  await ctx.http.api(
    `/merchant/${merchantId}/project/${projectId}/landing/${domain}/blocks/${blockId}`,
    { method: 'DELETE', label: `delete block ${blockId}` }
  );

  return { deleted: true, blockId, domain };
}
