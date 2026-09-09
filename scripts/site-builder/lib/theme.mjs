/**
 * Theme merge.
 *
 * Send base primitives, never derived values: the server rebuilds
 * calculatedTheme from them (normalizeEntityTheme + syncCalculatedTheme run in
 * the batch-patch handlers), so anything derived we sent would be discarded.
 * Untouched fields — buttons, fonts, calculationType, backgrounds — carry
 * through unchanged.
 *
 * DIVERGENCE FROM THE MCP SERVER, DELIBERATE. It passed the tool-shaped object
 * straight into theme-engine's applyInput(), which reads only
 * primary/bg/secondary/overlay/text/border/isDark/isWCAG. Three of the eight
 * documented fields therefore did nothing at all: `background` (applyInput
 * reads `bg`), `buttonBorderRadius` and `backgroundBlur` (both taken from the
 * base, never from the input). hasThemeChanges() still passed, so the tool
 * reported success. Here each field is mapped to where its description says it
 * goes.
 */

import { ToolError } from './errors.mjs';

const INPUT_COLORS = ['primary', 'text', 'secondary', 'border', 'overlay'];

export function hasThemeChanges(input) {
  return !!input && Object.values(input).some((v) => v !== undefined);
}

/**
 * @param base the current SiteTheme (site.theme, or the page's when enabled)
 * @param input the tool-shaped partial
 */
export function mergeThemeChanges(base, input) {
  if (!base || !base.input) {
    throw new ToolError('This site has no base theme to merge onto.', {
      hint:
        'Open the site in the editor and save the theme once so a base theme exists, then retry. ' +
        'Inventing default primitives here would overwrite the editor defaults with different ones.',
    });
  }

  const next = { ...base, input: { ...base.input } };

  for (const key of INPUT_COLORS) {
    if (input[key] !== undefined) next.input[key] = input[key];
  }

  if (input.background !== undefined) {
    next.pictureBackground = { ...(base.pictureBackground ?? {}), color: input.background };
  }
  if (input.buttonBorderRadius !== undefined) next.buttonBorderRadius = input.buttonBorderRadius;
  if (input.backgroundBlur !== undefined) next.backgroundBlur = input.backgroundBlur;

  return next;
}

/** The primitives echoed back to the caller; calculatedTheme is never shown. */
export function themeSummary(theme) {
  return {
    primary: theme?.input?.primary ?? null,
    text: theme?.input?.text ?? null,
    secondary: theme?.input?.secondary ?? null,
    border: theme?.input?.border ?? null,
    overlay: theme?.input?.overlay ?? null,
    background: theme?.pictureBackground?.color ?? null,
    buttonBorderRadius: theme?.buttonBorderRadius ?? null,
    backgroundBlur: theme?.backgroundBlur ?? null,
  };
}
