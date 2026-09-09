# Styling: escalate cheapest-first

Stop at the first rung that fully covers the request. Each rung costs more and is more fragile than
the one above it.

## 1. Block fields

If the change maps to a field the block already has — a color, a layout toggle, a label — set it
with `update_block`. Most robust, nothing to maintain. Check `get_block_schema` (or `get_block` on
an existing block) before deciding a field does not exist.

## 2. An html block with CSS

For appearance the block fields do not cover, create a **new** `html` block and write CSS in
`values.css`. For client-side behaviour — a search overlay, sorting, injected markup — use
`values.javascript` (vanilla JS, client-only, fragile).

```bash
node "$SB" get_block_schema '{"module":"html"}'      # html is versioned — you need maxVersion
node "$SB" create_block '{
  "merchantId":"…","projectId":"…","domain":"…","pageId":"…",
  "module":"html","version":2,
  "blockValues": { "devName":"Code Styling - Store Cards", "values": { "css":"…" } }
}'
```

Two rules:

- **Always create a new html block. Never `update_block` an existing one's `values.css` or
  `values.javascript`.** The patch replaces the whole string, wiping every earlier style with no
  warning. Each html block injects globally, so several compose fine.
- **Name it** `devName: "Code Styling - {what it targets}"`, so the next person can tell what a
  page's styling blocks do without reading their CSS.

### CSS pitfalls

- **Use descendant selectors, not `>`.** You will be working from class names without knowing the
  nesting depth. Wrong: `.buy-button > *`. Right: `.buy-button button`.
- **Never guess a selector from a field name or a schema key.** Rendered class names routinely
  differ from the JSON keys. A guessed broad selector silently captures unrelated elements — image
  badges, accordion toggles, social icons — that happen to share a keyword.
- **Expect to need `!important`.** Block components inject their own CSS, often CSS-in-JS, so
  overriding background, border-radius or color usually needs it.
- **Wrap in `MutationObserver` or `requestAnimationFrame`** when a block renders its items
  asynchronously, or your JS runs before the elements exist.
- **Client-hydrated blocks show up as skeletons.** `newStore` and friends build their interactive
  parts (buy buttons, cards, cart) in the browser. A server-rendered snapshot only contains
  `react-loading-skeleton` / `skeleton-card__*` placeholders. When you see a layout wrapper class
  with skeleton children, strip the layout modifier to infer the real element class —
  `block__element--vertical-layout` → `block__element`. Site Builder uses BEM throughout, so this
  is reliable, but confirm the class actually matched before calling it done.

> **Gap you need to know about.** The MCP server had `get_rendered_block_html`, which returned the
> real class names for a block. It is **not ported** — the preview endpoint's authentication has to
> be confirmed against production first. Until then, get class names from the live page in a browser
> (devtools, or a Playwright snapshot if one is available) rather than guessing them. Guessed
> selectors are the single largest source of CSS that appears to do nothing.

## 3. An AI block

Only when the request genuinely needs an integrated block: React, block-utils hooks, live Store
data, a settings panel, server rendering, persistent state. Not for a DOM tweak. Most expensive
rung, and **not ported yet** — the AI-block commands are unavailable, so this currently means
directing the user to the editor.
