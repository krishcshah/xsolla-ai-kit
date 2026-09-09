/**
 * Tool input → JSON Patch, and the batch-PATCH envelope.
 *
 * PATCH /api/merchant/M/project/P/ui/{landingId}/batch is the only general write
 * in sb-api. Note the path parameter is the site _id, not the domain — every
 * other endpoint keys on domain, so a write always costs a structure read first.
 */

/**
 * "internalBlockValues.title" → { internalBlockValues: { title: ... } }
 *
 * Used for validation only. Patching deliberately uses the *unexpanded* keys —
 * see buildValuePatches.
 *
 * Array index access is not supported: "slides.0.title" expands to an object
 * with the string key "0", not an array. Replace whole arrays via `components`.
 */
export function expandDotNotation(values) {
  const result = {};
  for (const [key, val] of Object.entries(values)) {
    const parts = key.split('.');
    let obj = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (typeof obj[part] !== 'object' || obj[part] === null || Array.isArray(obj[part])) {
        obj[part] = {};
      }
      obj = obj[part];
    }
    obj[parts[parts.length - 1]] = val;
  }
  return result;
}

/**
 * Each dot-notation key compiles to its own deep patch path, which is the whole
 * mechanism behind "only the fields you passed change". Expanding first and
 * patching the expanded object would replace whole subtrees instead.
 *
 * op: 'add' is deliberate — RFC 6902 §4.1 sets the member whether or not it
 * already exists, so one patch shape covers both new and existing fields.
 */
export function buildValuePatches(values) {
  return Object.entries(values).map(([key, value]) => ({
    op: 'add',
    path: ['values', ...key.split('.')],
    value,
  }));
}

/** components is the exception: replaced whole, never patched per-leaf. */
export function componentsPatch(components) {
  return { op: 'replace', path: ['components'], value: components };
}

/**
 * Multiple keyed requests apply in ONE transaction, and they may target
 * different entity types — a site theme, two page themes and ten block edits go
 * in a single call. The keys are free-form labels; the MCP server used
 * "page-blocks" for placement and `update-{blockId}` for edits.
 *
 * Entity types are 'page' | 'block' | 'site' | 'valuesSystem' (per
 * BatchedEntityChanges). Note there is no 'document' type, despite what the
 * extraction notes recorded.
 */
export function batchBody(entries) {
  const body = {};
  for (const [key, entry] of Object.entries(entries)) body[key] = entry;
  return body;
}

export function blockEntry(blockId, patches) {
  return { type: 'block', id: blockId, patches };
}

export function pageEntry(pageId, patches) {
  return { type: 'page', id: pageId, patches };
}

/** Site-level: the theme, and the site's own blocks array. */
export function siteEntry(landingId, patches) {
  return { type: 'site', id: landingId, patches };
}
