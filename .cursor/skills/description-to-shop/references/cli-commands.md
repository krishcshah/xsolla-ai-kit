# `xsolla shopbuilder` — command reference

Surveyed against **Xsolla CLI 1.9.4** (commit `bad3030`, built 2026-08-25). 43 commands.
Regenerate with `xsolla shopbuilder <cmd> --help` if the CLI is updated.

This is the complete write surface available to the `description-to-shop` skill.
Everything the skill builds must come from these commands.

---

## The one thing that breaks scripts: two identifier systems

Shop Builder addresses landings two different ways, and the split is **not** intuitive.

| Identifier | What it is | Where it comes from |
|---|---|---|
| `--slug` | The landing's domain name, e.g. `voidwall` → `voidwall.xsolla.site` | You choose it at `create-website` |
| `--landing-id` | The landing's MongoDB `_id` | Top-level `_id` in `get-structure --json` |

**Commands that take `--landing-id`** (the block/asset mutation set):
`add-block`, `create-custom-block`, `delete-asset`, `delete-block`, `duplicate-block`,
`list-assets`, `move-block`, `update-block`, `upload-asset`

**Every other command takes `--slug`.**

Consequence for the skill: `get-structure --slug <slug> --json` must run **before any block
work**, and its `_id` must be threaded through every subsequent call. Cache it once per run.

### ID map from `get-structure`

```
_id                        -> --landing-id
pages[]._id                -> --page-id
pages[].blocks[]._id       -> --blockid   (note: --blockid, not --block-id, on delete/duplicate)
pages[].blocks[].module    -> block type  (e.g. lead, newStore, faq)
```

`get-block` uses `--block-id` (hyphenated). `delete-block` and `duplicate-block` use
`--blockid` (no hyphen). Easy to get wrong; the scripts should normalize this.

---

## Commands by role in the build flow

### 1. Create the landing

| Command | Key flags | Notes |
|---|---|---|
| `create-website` | `--name --slug --type --colorscheme --theme` | `--type` accepts **only `topup`** here. Project must have Shop Builder enabled or the backend 404s. |
| `set-landing-type` | `--slug --type` | Accepts `topup`, `store`, `sellingpage`. **Run immediately after `create-website`** — that command can leave `type:null`, which leaves the landing unconfigured and makes preview 404. |
| `duplicate-website` | `--slug` | Clone an existing landing. Possible archetype-template mechanism — see open questions. |

### 2. Structure — pages and blocks

| Command | Key flags | Notes |
|---|---|---|
| `get-structure` | `--slug` | **Run first.** Source of every ID below. Use `--json`. |
| `list-pages` / `get-page` | `--slug` (+ `--page-id`) | Read-only. |
| `add-page` | `--slug --name --path` | `--name` 1–80 chars. `--path` lowercase `a-z0-9-/` only, max 80. |
| `add-block` | `--landing-id --page-id --block [--index]` | `--block` is a **template name** (e.g. `hero`), not an ID. Appends when `--index` omitted. |
| `move-block` | `--landing-id --page-id --source --destination` | Zero-based indices. |
| `duplicate-block` | `--landing-id --page-id --blockid [--index]` | |
| `delete-block` | `--landing-id --page-id --blockid --force` | |
| `get-block` | `--slug --block-id` | Returns block with localizations inlined. |

### 3. Content — the batch patch API

`update-block` is the workhorse for everything that isn't structural: block values, page
settings, site settings, and (almost certainly) catalog wiring.

```
--data '{"<requestId>":{"type":"block"|"page"|"site","id":"<entityId>",
         "patches":[{"op":"add"|"remove"|"replace","path":[...],"value":<any>}]}}'
```

- `id` is the block `_id`, page `_id`, or the landing id / literal `"current-site"` for site-level.
- Paths use **Immer segment-array format** (`["values","title"]`), not JSON-Pointer strings.
- Protected, cannot be patched: `_id`, `module`, `blockVersion`.

Example — rename a block title:

```
--data '{"r1":{"type":"block","id":"<blockId>","patches":[
  {"op":"replace","path":["values","title"],"value":{"en-US":"New Title"}}]}}'
```

### 4. Localization

| Command | Key flags | Notes |
|---|---|---|
| `add-language` / `delete-language` | `--slug --language` | Locale codes like `en-US`. |
| `get-localization` | `--slug` | Full store, all locales and pages. Resolve IDs here first. |
| `update-localization` | `--slug --data` | Single string. |
| `update-many-localization` | `--slug --data` | Many strings, **one locale per call**. |

> **Destructive trap.** In `update-many-localization`, each value must be exactly
> `{"translation": "<html>"}`. A bare string, or any other key (`value`, `text`,
> `translations`), returns **200 OK but writes an empty string** for that locale.
> Silent data loss. The scripts must validate this shape before sending, and the
> backup (SB-8862) must capture `get-localization` so it is recoverable.

Block text is HTML — wrap in tags (`<p>…</p>`).

Shape:
```
{"locale":"en-US","perScopeValues":{
  "<pageId>":{"L:<id>":{"translation":"<p>Hi</p>"}},
  "common":{"L:<id2>":{"translation":"<p>Footer</p>"}}}}
```
Scope keys are a page `_id` or the literal `"common"`. One call can span many scopes.

### 5. Assets

| Command | Key flags | Notes |
|---|---|---|
| `upload-asset` | `--landing-id --file --type` | `--type` is `image` or `font`. |
| `list-assets` / `delete-asset` | `--landing-id` (+ `--asset-id`) | |

### 6. Preview and readiness — the edge of our scope

| Command | Key flags | Notes |
|---|---|---|
| `enable-preview` / `disable-preview` | `--slug` | |
| `preview-link` | `--slug` | Returns the public preview token and link. **This is our deliverable to the user.** |
| `verify-website` | `--slug` | Read-only readiness check. |
| `list-agreements` | `--merchant-id` | Merchant licensing agreements; a publish prerequisite. |

**There is no publish command in the CLI.** `verify-website` only *checks* readiness.
The epic's "never publish" rule is therefore enforced by the tool surface itself — the
skill cannot publish even by accident. Worth stating explicitly in the guardrails (SB-8868)
and the README, since it converts a policy risk into a structural one.

### 7. Out of scope for this skill

- `create-custom-block` / `update-ai-block` / `get-ai-block` / `delete-ai-block` — compile
  arbitrary TSX into custom blocks. The epic mandates **standard blocks only**. The skill
  must never call these; add it to the guardrails.
- `add-domain` / `change-domain` / `verify-domain` / `delete-domain` — external domains.
  Test builds live on `<slug>.xsolla.site`.
- `update-restrictions` / `delete-restrictions` — geo/IP gating.
- `add-connector` / `delete-connector` — GTM/GA analytics tags.
- `apply-version` / `list-versions` — archived versions. **Possibly relevant to backup**
  (SB-8862): if the backend already versions every write, our export may be belt-and-braces.
  Confirm on the sandbox.
- `delete-website` — never called by the skill.

---

## Standard block catalog — verified

Established empirically on a live `store` landing (project `315423`, slug `sb8786-probe`)
and confirmed against `get-structure`, not inferred from help text. **15 modules.**

| Module | Seeded by `add-page` | Notes |
|---|---|---|
| `header` | ✅ | Site navigation |
| `leadGameSales` | ✅ | Hero variant aimed at game sales |
| `description` | ✅ | Prose section |
| `packs` | ✅ | Currency / item packs |
| `bento-grid` | ✅ | **Only kebab-case module** — everything else is camelCase |
| `gallery` | ✅ | Image gallery |
| `requirements` | ✅ | System requirements |
| `faq` | ✅ | Question list |
| `footer` | ✅ | |
| `hero` | — | |
| `lead` | — | |
| `news` | — | |
| `newStore` | — | **The storefront block.** Binds to the catalog — see below |
| `store` | — | Second store block; relationship to `newStore` unknown |
| `rewards` | — | |

**How to reproduce:** `add-page` seeds a 13-block default template covering 9 distinct
modules. The other 6 were found by probing `add-block` with candidate names and verifying
each against `get-structure`.

> **Do not trust `add-block`'s exit code.** It returns `0` on failure. A failed add prints
> `Error: HTTP 500` while a successful one prints `_id: …`, but the reliable check is to
> diff `get-structure` before and after. An early probe run of ours reported nine false
> positives on exit code alone. Any script that adds blocks must verify against the
> structure, not the return code.

**Names not in the catalog** (all probed, all rejected): `video`, `banner`, `subscriptions`,
`bundles`, `cta`, `features`, `roadmap`, `team`, `socials`, `topup`, `text`, `image`,
`carousel`, `characters`, `trailer`, `partners`, `countdown`, `timeline`, `testimonials`,
`reviews`, `awards`, `platforms`, `editions`, `compare`, `pricing`, `social`, `catalog`,
`gameKeys`, `checkout`, `upsell`, `items`, `featured`, `wishlist`, `preorder`, `download`.

---

## Catalog binding — how a store block reaches the catalog

There is no command for this. The binding lives inside the `newStore` block's
`components[]`, and is reached with an `update-block` patch:

```json
"components": [{
  "type": "newStoreSection",
  "section": {
    "item": { "autoSelected": false, "group": "welcome-offer", "type": "bundle" },
    "title": { "enable": false, "id": "L:<localizationId>" },
    "hiddenEmpty": true, "horizontalScroll": false
  },
  "card": { "selectedLayoutType": "featured", "layouts": { ... } }
}]
```

**A store block binds to an item _group_ and an item _type_ — not to item IDs.**

This is the single most important structural fact for the skill:

- The **catalog's group structure determines the storefront's section structure.**
  One `newStoreSection` per group. Seeding the catalog is therefore a design step,
  not throwaway setup.
- Intake must collect item **groups**, not just a flat item list.
- `card.selectedLayoutType` picks the card design. Available layouts, read from a live
  block: `featured`, `vertical`, `horizontal`, `large`, `bundle_vertical`,
  `game-keys-vertical`. Each carries its own `alignment`, `image.format`, `image.size`,
  `itemsDescriptionEnabled` and `priceInButton`.

## Theme

`create-website --theme` takes JSON. Settable top-level fields, from a live landing:

`backgroundBlur`, `buttonBorderRadius`, `buttons`, `calculationType` (observed:
`"xds-theme"`), `fonts`, `input`, `pictureBackground`, `videoBackground`.

`theme.calculatedTheme` is derived — a full design-token tree of control colors — and
should not be written directly. `--colorscheme` does not appear as a field on the landing;
how it maps into the theme is still unknown, but `--theme` JSON is sufficient without it.

`storeApi` on the landing is only request tuning (`itemsPerRequest`, retry counts), not a
catalog binding — don't confuse the two.

---

## Auth

Every shopbuilder command authenticates the same way:

1. **`xsolla auth login`** — OAuth2 + PKCE browser flow, token in the macOS Keychain,
   auto-refreshed. Documented as the recommended path.
2. `export XSOLLA_SHOPBUILDER_SESSION="pa-v4-token=..."` — the Publisher Account
   `pa-v4-token` cookie, copied by hand. Documented as the manual fallback.

The epic calls the manual copy a known gap. Per scope guard: use path 1, document where it
falls short, file a ticket — do not work around it in code.

---

## Gap-ticket candidates (SB-8872)

The `shopbuilder` commands are **generated from OpenAPI 3.x specs** (see `xsolla --help`),
so most of these are spec gaps rather than CLI bugs — which is where Aadi and Humza's
spec work on the Shop Builder team comes in.

1. **Invalid block name returns HTTP 500.** `add-block --block <anything-invalid>` returns
   a bare 500 with no list of valid names. Should be a 400 naming the valid templates.
   Combined with (2), this makes the block catalog undiscoverable without trial and error.
2. **No way to enumerate block templates.** There is no `list-blocks` command and no
   registry on the landing — the top-level `blocks` array is just the IDs of blocks already
   placed. The catalog in this document had to be brute-forced.
3. **`add-block` exits 0 on failure.** A 500 still returns exit code 0, so shell scripts
   cannot detect a failed add without re-reading the structure.
4. **`create-website --type` accepts only `topup`**, while `set-landing-type` accepts
   `topup`, `store`, `sellingpage`. Forces a two-call dance for any non-topup landing, and
   leaves `type:null` in between — which 404s the preview if the second call is missed.
5. **Six commands silently depend on config.** `enable-preview`, `disable-preview`,
   `preview-link`, `get-localization`, `update-localization`, `update-many-localization`
   take only `--slug`, with no `--merchant-id` / `--project-id`. Reproducible scripts
   cannot pin the target explicitly.
6. **An invalid `XSOLLA_API_KEY` silently overrides a valid login.** Any command 401s until
   the variable is unset, even with a healthy `xsolla auth login` session. The CLI's error
   message explains this well; the precedence itself is the surprise.
7. **Inconsistent flag naming.** `get-block` takes `--block-id`; `delete-block` and
   `duplicate-block` take `--blockid`.

---

## Still open

1. **`store` vs `newStore`** — two store modules exist. Which one do the archetypes use,
   and what is the difference? `newStore` is the one carrying the catalog binding on a
   real landing, so it is the working assumption.
2. **How does `--colorscheme` map into the theme?** It is not a field on the landing.
   Not blocking: `--theme` JSON covers styling.
3. **Does `list-versions` give us backup for free?** If the backend versions every write,
   our export may be belt-and-braces.
4. **Is the block catalog landing-type dependent?** The catalog here was read off a `store`
   landing. A `topup` or `sellingpage` landing may expose a different set.
