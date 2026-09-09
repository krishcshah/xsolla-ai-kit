---
name: site-builder-blocks
description: >-
  Adds, edits, inspects and deletes the content blocks inside an Xsolla Site Builder page —
  galleries, FAQs, heroes, descriptions, footers, store and news blocks, custom HTML/CSS blocks,
  and the four federated blocks (offer chain, daily reward, social quests, offerwall). Also reads a
  block's translations and pushes progress toasts to open editors. Use whenever a developer says
  "add a gallery / FAQ / hero / footer to this page", "add a block", "what blocks are on this
  page", "change the block title", "update the hero image", "swap that picture", "edit this
  block's text", "set the button label", "delete this block", "remove the gallery", "which block
  modules exist", "what fields does this block take", "what version should I use", "show me the
  translations", "what languages is this block in", "style the store cards", "inject custom CSS",
  or "add custom code to the page". Read `site-builder-pages` first if you do not already have the
  site slug and the page id — every command here needs both.
metadata:
  owner: a.springut
  domain: site-builder
  status: draft
---

# Site Builder — blocks

## Prerequisites

```bash
export SB_TOKEN=<Site Builder editor token>
SB="${CLAUDE_PLUGIN_ROOT:-.}/scripts/site-builder/sb.mjs"
```

You need `merchantId`, `projectId`, the site `domain` (the slug, e.g. `sb-1234-site`) and usually
a `pageId`. Get them from `site-builder-pages` (`list_sites` → `list_pages`).

Arguments are one JSON object; `node "$SB" --help <command>` prints the fields. Exit codes: `0` ok
· `1` rejected, nothing sent · `2` API refused · **`3` partial write, read the message**.

## The order to call things in

This is not stylistic — each step produces something the next one needs.

**To add a block:**
1. `list_block_modules` — the module names, and `maxVersion` for each.
2. `get_block_schema '{"module":"…"}'` — the fields, and the version you must pass.
3. `create_block` — with `version` set to that exact `maxVersion`.

**To change a block:**
1. `list_blocks` or `search_blocks` — find it.
2. `get_block` — see the current field shape. Do not guess field names.
3. `update_block` — pass only the fields you are changing.

**To change text in another language:** `get_block_translations`. It is the only command that
exposes the real `localizationId`; `get_block` strips it. Writing translations is not ported yet —
see [references/localization.md](references/localization.md), which also explains why native
blocks never needed a separate localization step at all.

## The editor freeze

Running any command against a site freezes the editor automatically, so a human cannot edit
underneath you. **Do not try to start the freeze.** It is not lifted automatically — run this once
when the entire task is done, not after each write:

```bash
node "$SB" send_notification '{"merchantId":"…","projectId":"…","domain":"…","title":"Done","halt":"end"}'
```

## Rules that are enforced, not suggested

**Deletion needs a real answer.** `delete_block` refuses unless `confirmed: true`. Call `get_block`
first, show the user what will go, and ask. A user saying "delete the gallery" is *not* the
confirmation — they have to answer the question you asked. There is no undo.

**Never guess which block they meant.** If the request has no explicit `blockId` and more than one
block could match ("rename the gallery title", with three galleries), enumerate them with
`search_blocks` or `list_blocks`, show `_id` + module + `devName` + something distinguishing, and
ask. Never pick by recency, conversation order, or alphabetically.

**Version must be exact.** A versioned module rejects both a missing version and an old one, each
time naming the number to use. Old versions have different component types and field names, so an
outdated block is not a smaller version of a current one — it is a different block.

**Layout blocks cannot be created.** `header`, `common-layout` and `side-by-side-layout` are
site-level and made automatically with every site. Asking for one is refused with the batch request
to use instead. For a sidebar there is a dedicated tool, which is not ported yet.

## Things that will bite you

**An image URL does not go where you think.** For a federated block, putting a URL on a field whose
default is an image id routes it into a *different branch* of the payload. The command does this for
you — pass the URL and it lands correctly. The point is that you cannot hand-build this payload
from the field shape alone, and a hand-built one is accepted by the API and renders nothing. See
[references/federated.md](references/federated.md).

**`create_block` is two steps and can half-succeed.** The block document is created, then attached
to the page. If the attach fails the command retries once and then exits `3` with the block id: the
block exists but is on no page. Surface that to the user and either place it or delete it — **do not
create another one**, or they will have two.

**Never `update_block` an html block's `values.css` or `values.javascript`.** The patch replaces the
whole string and wipes every earlier style. Always `create_block` a *new* html block instead; each
one injects globally so they compose. Name them `devName: "Code Styling - {what it targets}"`.

**Localized text is replaced, not merged.** Patching a localized field replaces the whole localized
object, so every locale you leave out is lost. Read the current value first.

**Plain text, not HTML.** In `localizedString`, pass plain text and let `quillWrapper` carry the tag
(`h2`, `p`, …). Pre-wrapping the text yourself double-wraps it.

**Some blocks hold no content.** `news`, `store`/`newStore`, `subscriptions-packs`, `retailers`,
`rewards` and `nft` render data from other Xsolla services. Creating one builds the shell only —
tell the user what still has to be configured. See [references/blocks.md](references/blocks.md).

## Reference

- [references/blocks.md](references/blocks.md) — modules and versions, `blockValues` shape, `LocalizedValueDescriptor`, the data-driven blocks
- [references/federated.md](references/federated.md) — the four federated modules, how their payload is built, images
- [references/localization.md](references/localization.md) — reading translations, native vs federated, what is not ported
- [references/styling.md](references/styling.md) — the cheapest-first styling ladder and the CSS pitfalls
- [../site-builder-pages/references/cli.md](../site-builder-pages/references/cli.md) — environment variables, exit codes, dry runs, what is not ported
