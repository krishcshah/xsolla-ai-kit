/**
 * Identity resolution — the universal preamble.
 *
 * GET /landing/{domain}/structure/internal returns the entire site document:
 * pages, blocks, layouts, theme. There is no per-page or per-block list
 * endpoint, so almost every read starts here, and every batch write needs the
 * landingId it carries.
 *
 * page.blocks holds block *id strings*; block objects live in the top-level
 * blocks[] array and are resolved client-side.
 */

import { ToolError } from './errors.mjs';

export function createIdentity(http) {
  const structures = new Map(); // "M/P/domain" → site document

  async function getStructure({ merchantId, projectId, domain }, { refresh = false } = {}) {
    const key = `${merchantId}/${projectId}/${domain}`;
    if (!refresh && structures.has(key)) return structures.get(key);
    const { data } = await http.api(
      `/merchant/${merchantId}/project/${projectId}/landing/${domain}/structure/internal`
    );
    // The typed SDK wrapped this in { data }; raw fetch returns the document.
    const site = data && data.data && data.data._id ? data.data : data;
    if (!site || !site._id) {
      throw new ToolError(`Site "${domain}" returned no structure.`, {
        hint: 'Check the domain — it is the site slug (e.g. "sb-xxxx-site"), not a network hostname. Call list_sites to enumerate.',
      });
    }
    structures.set(key, site);
    return site;
  }

  /** The site _id. Every batch write keys on this, not on domain. */
  async function landingId(target, opts) {
    return String((await getStructure(target, opts))._id);
  }

  async function findPage(target, pageId, opts) {
    const site = await getStructure(target, opts);
    const page = (site.pages || []).find((p) => idOf(p) === String(pageId));
    if (!page) {
      throw new ToolError(`Page "${pageId}" is not on site "${target.domain}".`, {
        hint: 'Call list_pages to enumerate pages and their ids.',
      });
    }
    return page;
  }

  /** Preview URLs key on page.path, not on pageId. */
  async function pagePath(target, pageId, opts) {
    return (await findPage(target, pageId, opts)).path;
  }

  /** page.blocks → the block ids on that page, in order. */
  async function pageBlockIds(target, pageId, opts) {
    const page = await findPage(target, pageId, opts);
    return (page.blocks || []).map(idOf);
  }

  async function findBlock(target, blockId, opts) {
    const site = await getStructure(target, opts);
    const block = (site.blocks || []).find((b) => idOf(b) === String(blockId));
    if (!block) {
      throw new ToolError(`Block "${blockId}" is not on site "${target.domain}".`, {
        hint: 'Call list_blocks or search_blocks to enumerate blocks and their ids.',
      });
    }
    return block;
  }

  /** Which page a block sits on, or null for a site-level (layout) block. */
  async function pageOfBlock(target, blockId, opts) {
    const site = await getStructure(target, opts);
    for (const page of site.pages || []) {
      if ((page.blocks || []).map(idOf).includes(String(blockId))) return page;
    }
    return null;
  }

  return { getStructure, landingId, findPage, pagePath, pageBlockIds, findBlock, pageOfBlock, idOf };
}

/** Blocks and pages appear as id strings, ObjectIds, or full documents. */
export function idOf(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (v._id !== undefined) return String(v._id);
  return String(v);
}
