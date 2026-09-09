/** pages — list_pages, get_page, create_page, update_page, reorder_blocks. */

import { ToolError } from '../lib/errors.mjs';
import { pageSummary } from '../lib/trim.mjs';
import { hasThemeChanges, mergeThemeChanges, themeSummary } from '../lib/theme.mjs';
import { batchBody } from '../lib/patch.mjs';
import { idOf } from '../lib/identity.mjs';

export async function list_pages(ctx, args) {
  const { merchantId, projectId, domain, includeDrafts = true } = args;
  const { data } = await ctx.http.api(
    `/merchant/${merchantId}/project/${projectId}/landing/${domain}/pages`
  );
  const pages = (data?.data ?? data ?? []).filter((p) => includeDrafts || !p.draft);
  return { domain, count: pages.length, pages: pages.map(pageSummary) };
}

export async function get_page(ctx, args) {
  const page = await ctx.identity.findPage(args, args.pageId);
  return {
    domain: args.domain,
    page: pageSummary(page),
    blockIds: (page.blocks || []).map(idOf),
    theme: page.theme?.enabled ? themeSummary(page.theme) : null,
  };
}

export async function create_page(ctx, args) {
  const { merchantId, projectId, domain, ...data } = args;
  const { data: body } = await ctx.http.api(
    `/merchant/${merchantId}/project/${projectId}/landing/${domain}/pages`,
    { method: 'POST', body: JSON.stringify(data), label: `create page ${data.path}` }
  );
  return { domain, page: pageSummary(body?.data ?? body) };
}

export async function update_page(ctx, args) {
  const { merchantId, projectId, domain, pageId, theme, ...rest } = args;

  const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  const changingTheme = hasThemeChanges(theme);

  if (Object.keys(patch).length === 0 && !changingTheme) {
    throw new ToolError('Nothing to update.', {
      hint: 'Provide at least one of name, path, draft, type, parsingUrl, theme.',
    });
  }

  let page;
  if (Object.keys(patch).length > 0) {
    const { data } = await ctx.http.api(
      `/merchant/${merchantId}/project/${projectId}/landing/${domain}/pages/${pageId}`,
      { method: 'PATCH', body: JSON.stringify(patch), label: `update page ${pageId}` }
    );
    page = data?.data ?? data;
  }

  // Theme is not a page-PATCH field: only the batch endpoint recomputes the
  // derived theme, so it is routed separately.
  let appliedTheme;
  if (changingTheme) {
    const site = await ctx.identity.getStructure(args);
    const landingId = String(site._id);
    const pageDoc = await ctx.identity.findPage(args, pageId);

    // Mirrors the editor: base off the page theme when it is enabled, else the
    // site theme, then flip enabled on.
    const base = pageDoc.theme?.enabled ? pageDoc.theme : site.theme;
    const newTheme = { ...mergeThemeChanges(base, theme), enabled: true };

    await ctx.http.api(`/merchant/${merchantId}/project/${projectId}/ui/${landingId}/batch`, {
      method: 'PATCH',
      body: JSON.stringify(
        batchBody({
          'update-page-theme': {
            type: 'page',
            id: pageId,
            patches: [{ op: 'replace', path: ['theme'], value: newTheme }],
          },
        })
      ),
      label: `update page theme ${pageId}`,
    });

    appliedTheme = newTheme;
    page = page ?? pageDoc;
  }

  return {
    domain,
    page: pageSummary(page),
    ...(appliedTheme ? { theme: themeSummary(appliedTheme) } : {}),
  };
}

/**
 * Rewrites page.blocks in the given order — the same whole-array replace the
 * editor's drag-and-drop sends.
 *
 * blockOrder must be a permutation of the page's current block ids. Anything
 * else would silently drop or invent blocks, so a mismatch is rejected with a
 * diff rather than patched.
 */
export async function reorder_blocks(ctx, args) {
  const { merchantId, projectId, domain, pageId, blockOrder } = args;

  const site = await ctx.identity.getStructure(args);
  const landingId = String(site._id);
  const currentOrder = await ctx.identity.pageBlockIds(args, pageId);

  const current = new Set(currentOrder);
  const next = new Set(blockOrder);
  const missing = currentOrder.filter((id) => !next.has(id));
  const extra = blockOrder.filter((id) => !current.has(id));
  const duplicates = blockOrder.filter((id, i) => blockOrder.indexOf(id) !== i);

  if (missing.length || extra.length || duplicates.length) {
    throw new ToolError(
      'blockOrder must be a permutation of the page\'s current blocks — same set, no missing, extra or duplicate ids.',
      {
        hint: 'Call list_blocks for the current order.',
        data: { missingFromYourOrder: missing, notOnThisPage: extra, duplicates, currentOrder },
      }
    );
  }

  if (currentOrder.every((id, i) => id === blockOrder[i])) {
    return { reordered: false, pageId, note: 'Already in the requested order.' };
  }

  await ctx.http.api(`/merchant/${merchantId}/project/${projectId}/ui/${landingId}/batch`, {
    method: 'PATCH',
    body: JSON.stringify(
      batchBody({
        'reorder-blocks': {
          type: 'page',
          id: pageId,
          patches: [{ op: 'replace', path: ['blocks'], value: blockOrder }],
        },
      })
    ),
    label: `reorder blocks on ${pageId}`,
  });

  return { reordered: true, pageId, blockOrder };
}
