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

Verified end to end: built by CLI, confirmed rendering real priced items in a
live preview.

There is no command for this. The binding lives in the `newStore` block's
`components[]` and is written with an `update-block` patch.

### A store block has FOUR sections by default, not one

A freshly added `newStore` block ships with four `newStoreSection` components,
pre-pointed at whatever the project already has. Patching `components[0]` leaves
three stale sections rendering junk — and a verification that re-reads
`components[0]` passes anyway, because it checks exactly what it just wrote.

`scripts/set-store-sections.sh` replaces the whole `components` array and
verifies every section.

### The item type strings

A section binds to an item **group** and an item **type** — never item IDs:

```json
"section": { "item": { "autoSelected": false, "group": "welcome-offer", "type": "bundle" } }
```

Only four type values work. **The API stores anything else verbatim — no error,
no coercion** — and the storefront then matches nothing and renders loading
skeletons forever:

| Value | Editor label | Notes |
|---|---|---|
| `virtual_good` | Virtual items | **Not** `virtual_item` |
| `virtual_currency` | Virtual currency | Currency packages. Use group `__all__` |
| `bundle` | Bundles | |
| `game_key` | Game keys | Inferred from the editor; not yet exercised |

There is no `virtual_currency_package`. We wrote one, the API accepted it, and
the shop silently rendered nothing.

`group` is a catalog group's `external_id`, or the sentinel `__all__`.

### Card layouts

`card.selectedLayoutType`, one of: `featured`, `vertical`, `horizontal`, `large`,
`bundle_vertical`, `game-keys-vertical`.

### The group structure is the storefront structure

One section per group, so seeding the catalog is a design step. Intake collects
groups, not a flat item list.

### Bundles need unhiding

`admin-create-bundles` has no `--is-show-in-store` flag. If a bundle does not
appear, `admin-unhide-bundle --bundle-sku <sku>` is the fix. (In our run the
bundles already had `is_show_in_store: true`, so this was not the cause — but
the command exists for a reason.)

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

## Behaviour you only find by running it

Five things that are not in any help text and will break a naive script.

### 1. `add-block` prepends; its help says it appends

> "`--index` … appended to the end when omitted"

It is not appended. With `--index` omitted, blocks land at the **front**, so a
page built in order comes out exactly reversed. Passing an explicit `--index`
per block places them correctly. **Always pass `--index`.**

### 2. `add-page` always seeds a 13-block template

There is no way to create an empty page. Every `add-page` produces:

`header · leadGameSales · description · packs ×3 · bento-grid ×3 · gallery · requirements · faq · footer`

So shaping a page means deleting the seed and adding what you want. That is
what `scripts/shape-page.sh` does — clear, then append with explicit indices,
which avoids `move-block` index arithmetic entirely.

### 3. Both reads and writes are throttled, and writes fail silently

Roughly half a dozen rapid `get-structure` calls start returning an empty body.
Worse, a rapid unpaced burst of `add-block` calls **silently drops every one**
and leaves the page empty — no error, exit code 0.

Consequences for any script here:

- Read the structure **once**, work from the cached JSON. Never re-read per item.
- Pace writes (~1s apart), and verify the final module sequence afterwards.
- Treat a mismatch as "retry slower", not "invalid block name" — both look the same.

`scripts/shape-page.sh` does all three, including one slower repair pass.

### 4. The CLI cannot mint a preview token

`enable-preview` and `preview-link` return **403** on a publisher login, and
`verify-website` returns **400**.

This is *not* about licensing agreements. Previews work perfectly well with the
merchant's `payment` and `product` agreements unsigned — verified. The editor's
Preview button mints a short-lived, **per-landing, browser-session-scoped**
token, and the CLI has no equivalent. Opening a preview URL minted for one
landing while pointed at another gives "Preview session expired".

So the honest end of an automated build is: built and verified by CLI, viewed by
a human clicking Preview in the editor. `scripts/preview.sh` says exactly that
and prints the built structure so a run is checkable without a browser.

### 5. The editor canvas lies about empty store sections

The canvas can show "No items found. You can add items here." for a store
section that renders correctly in the live preview. Verify against the preview
or `get-structure`, never the canvas.

---

## Gap tickets — filed

All filed 2026-09-11 and linked to SB-8786. The `shopbuilder` commands are **generated
from OpenAPI 3.x specs** (see `xsolla --help`), so most are spec gaps rather than CLI bugs.

| Ticket | Covers |
|---|---|
| SB-8994 | `add-block` prepends although its help says it appends |
| SB-8995 | Invalid store-section item types stored verbatim; undocumented 4 default sections |
| SB-8996 | Throttled reads return empty, throttled writes fail silently, exit 0 on HTTP 500 |
| SB-8997 | No block-template enumeration; invalid name returns bare 500; no way to make an empty page |
| SB-8998 | CLI cannot mint a preview token |
| SB-8999 | Seven consistency issues across `shopbuilder` and `catalog` |

Detail behind each:

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
8. **`add-block` prepends although its help says it appends.** Either the behaviour or
   the documented default is wrong. Highest-impact item here: it silently reverses any
   page built without an explicit `--index`.
9. **Throttled writes fail silently.** A burst of `add-block` calls returns success and
   creates nothing. A 429, or any error at all, would make this self-diagnosing.
10. **No way to create an empty page.** `add-page` always seeds 13 blocks, so every
    custom layout starts with 13 deletes.
11. **Catalog create commands report a missing `--description` as a 422.** `create-items`
    correctly says "required flag not set"; `admin-create-currency-package` and
    `admin-create-bundles` return `Unprocessable Entity` instead. Same root cause,
    two error styles.
12. **Invalid store-section item types are stored verbatim** — *high*. Writing
    `type: "virtual_currency_package"` (not a real value) returns success, persists,
    and the storefront then renders loading skeletons forever. No validation, no error.
13. **A new `newStore` block ships with four pre-filled sections.** Undocumented, so a
    caller patching `components[0]` silently leaves three stale sections live.
14. **`enable-preview` / `preview-link` 403 for publisher logins.** The editor can mint a
    preview token but the CLI cannot, so an automated build can never produce a viewable
    link. This is the single biggest gap for agent-driven Shop Builder work.
15. **`config set` writes to an environment.** Setting `project-id` landed in a `dev`
    environment whose `merchant-id` was `0`, silently changing the active merchant.

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
