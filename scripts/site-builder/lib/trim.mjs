/**
 * Response shaping.
 *
 * The MCP server trimmed responses for context budget — create_block discarded
 * the API response entirely because a federated block carries full
 * resources/internalBlockValues at roughly 150 KB. A CLI's stdout lands in the
 * same context window, so the trimming has to be ported too: one untrimmed
 * create_block blows the window.
 */

export function siteSummary(site) {
  if (!site) return null;
  return {
    id: site._id ? String(site._id) : undefined,
    domain: site.domain,
    name: site.name,
    published: site.published ?? site.isPublished,
    pages: (site.pages || []).length,
    blocks: (site.blocks || []).length,
    locales: site.languages || site.allowedLanguages,
  };
}

export function pageSummary(page) {
  if (!page) return null;
  return {
    id: page._id ? String(page._id) : undefined,
    path: page.path,
    name: page.name,
    blocks: (page.blocks || []).length,
    isMain: page.isMain,
  };
}

export function blockSummary(block, { module } = {}) {
  if (!block) return null;
  return {
    id: block._id ? String(block._id) : undefined,
    module: module ?? block.module,
    devName: block.devName ?? block.values?.devName,
    version: block.version,
  };
}

/**
 * A block, minus the branches that dominate its size. get_block_translations
 * existed as a cheap get_block for exactly this reason.
 */
export function blockWithoutBulk(block) {
  if (!block) return null;
  const { values = {}, ...rest } = block;
  const { resources, internalBlockValues, ...leanValues } = values;
  return {
    ...rest,
    values: leanValues,
    _omitted: [
      resources ? 'values.resources' : null,
      internalBlockValues ? 'values.internalBlockValues' : null,
    ].filter(Boolean),
  };
}
