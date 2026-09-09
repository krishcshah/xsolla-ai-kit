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

## Known block module names

Only three are confirmed so far, from the `get-structure` help text: `lead`, `newStore`, `faq`.
`hero` appears as an `add-block` example.

**The full catalog is not discoverable from `--help`.** It has to be read off a live
landing's `get-structure`. This is the blocking dependency for SB-8859's second half and
for all three archetypes (SB-8865/8866/8867).

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

## Open questions for the sandbox run

1. **What is the full standard block catalog?** Blocks the archetypes need most: hero,
   store/catalog, bundles, FAQ, footer, nav.
2. **How is a store block wired to a catalog?** No dedicated command exists. The bundled
   CLI skill describes "wiring a store block to a catalog", so it is presumably an
   `update-block` patch. The exact patch path is unknown and is on the critical path for
   every archetype.
3. **Why does `create-website --type` accept only `topup`** when `set-landing-type` accepts
   all three? Deliberate two-step, or an oversight? → gap ticket candidate (SB-8872).
4. **Six commands take only `--slug`** with no `--merchant-id` / `--project-id`:
   `enable-preview`, `disable-preview`, `preview-link`, `get-localization`,
   `update-localization`, `update-many-localization`. Presumably resolved from config.
   Confirm, because it makes those calls silently config-dependent — a hazard for scripts
   meant to be reproducible. → gap ticket candidate.
5. **Does `list-versions` give us backup for free?**
