---
name: site-builder-pages
description: >-
  Creates and edits Xsolla Site Builder sites, pages and themes through the Site Builder API —
  listing sites, reading a site's structure, adding and renaming pages, changing routes,
  publishing drafts, reordering the blocks on a page, and restyling a site or a single page
  (colors, button radius, background blur). Use whenever a developer says "list my Site Builder
  sites", "what pages does this site have", "add a page", "create a news page", "rename this
  page", "change the page path / route", "publish this page", "unpublish / make it a draft",
  "clone a page from another site", "reorder the blocks", "move that block up", "change the site
  colors", "restyle the site", "set the brand color", "dark theme for the site", "theme just this
  one page", or "make the buttons rounder". Also use it first when a Site Builder request needs a
  site id, a landing id, or a page id, since every other Site Builder command needs those.
  Pairs with `site-builder-blocks` — that skill edits the content inside a page; this one owns the
  site, its pages, and its theme.
metadata:
  owner: a.springut
  domain: site-builder
  status: draft
---

# Site Builder — sites, pages and themes

## Prerequisites

```bash
export SB_TOKEN=<Site Builder editor token>    # required for everything here
```

Optional: `SB_BASE_URL` to target something other than production, `SB_DRY_RUN=1` to print the
requests a write would send without sending them.

## Running a command

```bash
SB="${CLAUDE_PLUGIN_ROOT:-.}/scripts/site-builder/sb.mjs"

node "$SB" --list                       # every command, read or write
node "$SB" --help update_page           # arguments, rendered from the real schema
node "$SB" get_site '{"merchantId":"…","projectId":"…","domain":"sb-xxxx-site"}'
```

Arguments are one JSON object. Exit codes: `0` done · `1` rejected before anything was sent ·
`2` the API refused · **`3` a write stopped half-done and needs your attention** — never treat 3
as a failure to retry blindly, read the message first.

`domain` is the **site slug** (`sb-xxxx-site`), not a network hostname. This is the single most
common mistake.

## Pick the command

| The user wants | Command |
| --- | --- |
| Which sites exist | `list_sites` |
| One site's summary and theme | `get_site` |
| Which pages exist | `list_pages` |
| One page, with its block ids | `get_page` |
| A new page | `create_page` |
| Rename, re-route, publish, or re-template a page | `update_page` |
| Restyle the whole site | `update_theme` |
| Restyle one page only | `update_page` with `theme` |
| Change the order of blocks on a page | `reorder_blocks` |
| Add, edit or delete a block | → `site-builder-blocks` |

## The editor freeze — read this once

The moment you run any command against a site, the editor shows a "working" backdrop so a human
cannot edit underneath you. That happens automatically. **Do not send `halt: "start"`.**

It is *not* lifted automatically. When the whole task is finished — after the last write, not after
each one — run exactly once:

```bash
node "$SB" send_notification '{"merchantId":"…","projectId":"…","domain":"…","title":"Done","halt":"end"}'
```

Skip it and the user is left staring at a frozen editor until they dismiss it by hand.

## Per-command notes

**`list_sites`** — paginated, and returns summaries only. Page through with `offset += limit`
while `offset + returned < total`. For a site's full detail, call `get_site`.

**`create_page`** — `name` and `path` are required. `path` is lowercase `a-z0-9-/`, no trailing
slash, and `/` is taken by the site's main page, so pick a sub-path like `/news`. Choose exactly
one content source: `type` (a site-template key), `parsingUrl` (only with a template that supports
parsing), or `createFromSite` (clone another site's main page by its `_id`). Never combine
`createFromSite` with `type` or `parsingUrl`. Omit all three for the default game-sales page.

**`update_page`** — needs `pageId` plus at least one change. Two things surprise people:
changing `path` to a route another page already uses makes the two pages **swap** paths, and
`type` only works on a page that is currently `empty`.

**`update_theme`** vs **per-page theme** — see [references/theming.md](references/theming.md).

**`reorder_blocks`** — `blockOrder` must be a permutation of the page's current block ids: same
set, nothing missing, added or duplicated. Anything else is rejected with a diff rather than
written, so you cannot silently drop a block. Read the current order from `get_page` first.

> One caveat worth knowing: this rewrites the whole `page.blocks` array, the same way the editor's
> drag-and-drop does. If a human reorders blocks in the editor between your read and your write,
> their change is overwritten. On a site someone is actively editing, confirm before reordering.

## Pitfalls

- **`domain` is a slug, not a hostname.** `sb-1234-site`, never `example.com`.
- **A theme change is not a page change.** `update_theme` restyles every page that has no override
  of its own. To touch one page, pass `theme` to `update_page` — that also switches that page to
  its own theme permanently.
- **Themes need an existing base theme.** A site whose theme was never saved in the editor is
  refused rather than given invented defaults, because guessing them would overwrite the editor's.
- **Exit code 3 means partial.** Something was created or changed and a follow-up step failed. The
  message names what exists and what to do; do not re-run the whole command.

## Reference

- [references/theming.md](references/theming.md) — which theme fields exist, what is recomputed server-side, site vs page scope
- [references/cli.md](references/cli.md) — environment variables, exit codes, dry runs, what is not ported yet
