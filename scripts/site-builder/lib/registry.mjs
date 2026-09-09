/**
 * The command table.
 *
 * The MCP server kept two hand-maintained lists — REQUIRE_TOKEN (37 entries)
 * and WRITE_TOOLS (19) — neither derived from what a handler actually does, so
 * a new tool missing from either silently lost its token guard or its audit
 * entry. Here both facts are properties of one row.
 *
 *   write  — mutates merchant state: audited at notice level with the submitted
 *            input, and subject to the editor freeze.
 *   local  — no backend call at all, so no token is required.
 */

import * as sites from '../tools/sites.mjs';
import * as pages from '../tools/pages.mjs';
import * as blocks from '../tools/blocks.mjs';
import * as notification from '../tools/notification.mjs';

export const TOOLS = {
  // sites
  list_sites: { handler: sites.list_sites, domain: 'sites' },
  get_site: { handler: sites.get_site, domain: 'sites' },
  update_theme: { handler: sites.update_theme, domain: 'sites', write: true },

  // pages
  list_pages: { handler: pages.list_pages, domain: 'pages' },
  get_page: { handler: pages.get_page, domain: 'pages' },
  create_page: { handler: pages.create_page, domain: 'pages', write: true },
  update_page: { handler: pages.update_page, domain: 'pages', write: true },
  reorder_blocks: { handler: pages.reorder_blocks, domain: 'pages', write: true },

  // blocks
  list_blocks: { handler: blocks.list_blocks, domain: 'blocks' },
  get_block: { handler: blocks.get_block, domain: 'blocks' },
  search_blocks: { handler: blocks.search_blocks, domain: 'blocks' },
  get_block_translations: { handler: blocks.get_block_translations, domain: 'blocks' },
  // Reads bundled metadata, and the publication catalog only when configured.
  list_block_modules: { handler: blocks.list_block_modules, domain: 'blocks', local: true },
  get_block_schema: { handler: blocks.get_block_schema, domain: 'blocks', local: true },
  create_block: { handler: blocks.create_block, domain: 'blocks', write: true },
  update_block: { handler: blocks.update_block, domain: 'blocks', write: true },
  delete_block: { handler: blocks.delete_block, domain: 'blocks', write: true },

  // notification
  send_notification: { handler: notification.send_notification, domain: 'notification', write: true },
};

export const toolNames = () => Object.keys(TOOLS).sort();

export function getTool(name) {
  return TOOLS[name] || null;
}

export function requiresToken(name) {
  const tool = getTool(name);
  return !!tool && !tool.local;
}

export function isWrite(name) {
  return !!getTool(name)?.write;
}
