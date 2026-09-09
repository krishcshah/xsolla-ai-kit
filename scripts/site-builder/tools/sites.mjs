/** sites — list_sites, get_site, update_theme. */

import { ToolError } from '../lib/errors.mjs';
import { siteSummary } from '../lib/trim.mjs';
import { hasThemeChanges, mergeThemeChanges, themeSummary } from '../lib/theme.mjs';
import { batchBody } from '../lib/patch.mjs';

export async function list_sites(ctx, args) {
  const { merchantId, projectId } = args;
  const limit = Math.min(Math.max(1, args.limit ?? 10), 25);
  const offset = Math.max(0, args.offset ?? 0);

  const { data } = await ctx.http.api(
    `/merchant/${merchantId}/project/${projectId}/landings?limit=${limit}&offset=${offset}`
  );

  // The endpoint returns a bare array when unpaginated and { landings, total }
  // when limit/offset are passed. Both shapes are live.
  const landings = Array.isArray(data) ? data : data?.landings ?? [];
  const total = Array.isArray(data) ? data.length : data?.total ?? landings.length;

  return { sites: landings.map(siteSummary), total, limit, offset };
}

export async function get_site(ctx, args) {
  const { merchantId, projectId, domain } = args;
  const { data } = await ctx.http.api(
    `/merchant/${merchantId}/project/${projectId}/landing/${domain}`
  );
  const site = data?.data ?? data;
  return { site: siteSummary(site), theme: themeSummary(site?.theme) };
}

export async function update_theme(ctx, args) {
  const { merchantId, projectId, domain, theme } = args;

  if (!hasThemeChanges(theme)) {
    throw new ToolError('Nothing to update.', {
      hint:
        'Provide at least one of: primary, text, secondary, border, overlay, ' +
        'background, buttonBorderRadius, backgroundBlur.',
    });
  }

  const site = await ctx.identity.getStructure(args);
  const landingId = String(site._id);
  const newTheme = mergeThemeChanges(site.theme, theme);

  await ctx.http.api(`/merchant/${merchantId}/project/${projectId}/ui/${landingId}/batch`, {
    method: 'PATCH',
    body: JSON.stringify(
      batchBody({
        'update-site-theme': {
          // 'site', not 'document' — this is the type the editor sends here.
          type: 'site',
          id: landingId,
          patches: [{ op: 'replace', path: ['theme'], value: newTheme }],
        },
      })
    ),
    label: 'update site theme',
  });

  return { domain, scope: 'site', theme: themeSummary(newTheme) };
}
