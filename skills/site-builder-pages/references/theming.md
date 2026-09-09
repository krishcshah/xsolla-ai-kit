# Theming a Site Builder site

## Two scopes

| Scope | Command | Effect |
| --- | --- | --- |
| Site | `update_theme` | Applies to every page that has **not** set its own override. The equivalent of the editor's "Save as global theme". |
| Page | `update_page` with `theme` | Applies to that page only, and **switches the page to its own theme permanently** (`theme.enabled` is turned on and stays on). |

A per-page theme is based on the page's current theme if it already has one, otherwise on the site
theme. So the first per-page change inherits the site look and then stops tracking it — a later
`update_theme` will no longer reach that page. Say so before doing it.

## Fields

Pass only what you want to change; everything else keeps its current value.

| Field | Type | Notes |
| --- | --- | --- |
| `primary` | CSS color | Accent / brand: buttons, links, highlights |
| `text` | CSS color | Body text |
| `secondary` | CSS color | Secondary surfaces |
| `border` | CSS color | Borders and dividers |
| `overlay` | CSS color | Overlays and backdrops |
| `background` | CSS color | Page background tint |
| `buttonBorderRadius` | number | px, `0` or more |
| `backgroundBlur` | number | `0` or more |

Alpha is allowed in the colors.

Typography is **not** editable here. Fonts and type scale are edited through the theme editor
(`content.typo` / font slots) in the Publisher Account UI.

## What the server owns

Only base primitives are sent. Every derived value — the whole calculated palette, contrast pairs,
per-component tokens — is recomputed server-side on save. Sending derived values would be ignored
at best, so the command strips them and sends the primitives plus the untouched parts of the theme
(buttons, fonts, `calculationType`, background media) exactly as they were.

That is also why a site with no saved theme is refused rather than defaulted: the base primitives
the editor would use are defined in the theme engine, and inventing a different set here would
silently change the look of every page.

## A note for anyone comparing against the old MCP server

The MCP `update_theme` tool advertised all eight fields, but three of them — `background`,
`buttonBorderRadius` and `backgroundBlur` — never took effect. They were passed to a merge
function that reads `bg` (not `background`) and takes radius and blur from the existing theme
rather than the input, so the call reported success and changed nothing. These commands map each
field to where its description says it goes, so all eight work. If a user says "the old tool
never changed the button radius", that is why.
