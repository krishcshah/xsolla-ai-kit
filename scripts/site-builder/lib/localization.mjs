/**
 * Localization.
 *
 * The sharpest piece of knowledge in the MCP server: reading a translation
 * needs TWO sources, because neither endpoint carries both halves.
 *
 *   GET /landing/{domain}/blocks/{id}   HYDRATED — inlines the current text at
 *       resources.localizedValues[key].texts.localizedString, but STRIPS the
 *       real localization id. Good for reading text, useless for updating.
 *   GET /landing/{domain}/structure/internal   RAW — texts is still
 *       { id: "L:uuid", enable }. That id is what update_localization needs.
 *
 * So text comes from the hydrated block and the id + scope from the raw one.
 * This is why the id can never be read from get_block.
 *
 * Two storage shapes: federated blocks key localizations through
 * internalBlockValues.translations; native blocks inline a
 * LocalizedValueDescriptor on each field, found by walking the tree.
 */

import { ToolError } from './errors.mjs';

export const ALLOWED_LOCALES = [
  'ar-AE', 'bg-BG', 'cs-CZ', 'de-DE', 'en-US', 'es-ES', 'fil-PH', 'fr-FR',
  'he-IL', 'hu-HU', 'id-ID', 'it-IT', 'ja-JP', 'km-KH', 'ko-KR', 'my-MM',
  'ne-NP', 'lo-LA', 'pl-PL', 'pt-BR', 'ro-RO', 'ru-RU', 'th-TH', 'tr-TR',
  'vi-VN', 'zh-CN', 'zh-TW',
];

export function assertLocale(locale) {
  if (!ALLOWED_LOCALES.includes(locale)) {
    throw new ToolError(`Invalid locale "${locale}".`, {
      hint: `Must be one of: ${ALLOWED_LOCALES.join(', ')}.`,
    });
  }
}

export function isLocalizedValueDescriptor(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.__type === 'localized-value-descriptor'
  );
}

/** Federated: internalBlockValues.translations maps field → resource key. */
export function collectFederatedLocalizations(hydrated, rawBlock) {
  const translations = hydrated?.values?.internalBlockValues?.translations ?? {};
  const hydratedValues = hydrated?.values?.resources?.localizedValues ?? {};
  const rawValues = rawBlock?.values?.resources?.localizedValues ?? {};

  return Object.entries(translations)
    .filter(([, resourceKey]) => hydratedValues[resourceKey]?.texts?.localizedString)
    .map(([field, resourceKey]) => {
      const entry = hydratedValues[resourceKey];
      return {
        field,
        localizationId: rawValues[resourceKey]?.texts?.id ?? null,
        tag: entry.texts.tag ?? '',
        texts: entry.texts.localizedString ?? {},
      };
    });
}

/** Native: recursive walk, reading the id from the raw tree at the same path. */
export function collectNativeLocalizations(hydratedNode, rawRoot, path, out) {
  if (Array.isArray(hydratedNode)) {
    hydratedNode.forEach((item, i) => collectNativeLocalizations(item, rawRoot, [...path, i], out));
    return;
  }

  if (isLocalizedValueDescriptor(hydratedNode)) {
    out.push({
      field: path.join('.'),
      localizationId: getByPath(rawRoot, [...path, 'id']) ?? null,
      tag: hydratedNode.tag ?? '',
      texts: hydratedNode.localizedString ?? {},
    });
    return;
  }

  if (hydratedNode === null || typeof hydratedNode !== 'object') return;

  for (const [key, val] of Object.entries(hydratedNode)) {
    collectNativeLocalizations(val, rawRoot, [...path, key], out);
  }
}

export function getByPath(obj, path) {
  let cur = obj;
  for (const seg of path) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[seg];
  }
  return cur;
}

/**
 * Block localizations are page-scoped when the block lives on a page and
 * common (site-level) otherwise. update_localization needs this to hit the
 * right scope — writing to the wrong one upserts silently.
 */
export function scopeOf(rawBlock) {
  const parent = rawBlock?.parent;
  return parent?.type === 'page' ? String(parent.id) : null;
}

/**
 * The orphan-write guard.
 *
 * POST /api/localization/update/{domain} UPSERTS. A hallucinated, truncated or
 * wrong-scope id therefore returns updated: true while writing somewhere
 * nothing reads. So confirm the id exists in the target scope first.
 *
 * Deliberately soft: if the extract call itself fails, proceed. The check is a
 * safety net, not a hard dependency.
 */
export async function assertLocalizationIdExists(http, { domain, localizationId, pageId }) {
  let extract;
  try {
    const { data } = await http.api(`/localization/extract/${domain}`);
    extract = data?.data ?? data;
  } catch {
    return { checked: false };
  }
  if (!extract) return { checked: false };

  const { common = {}, pages = {} } = extract;
  const scope = pageId ? pages[pageId]?.texts ?? {} : common;

  if (!(localizationId in scope)) {
    throw new ToolError(
      `Localization id "${localizationId}" is not in ${
        pageId ? `page "${pageId}"` : 'common (site-level)'
      } scope.`,
      {
        hint:
          'Call get_block_translations for the correct localizationId and pageId. ' +
          'Do not use the short resourceKey from internalBlockValues.translations.',
      }
    );
  }
  return { checked: true };
}
