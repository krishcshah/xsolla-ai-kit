---
name: shop-translation
description: >-
  Translates an entire Xsolla shop into new languages — the catalog items and the Site Builder
  storefront together — with the agent producing the translations and the xsolla CLI writing them.
  Use when someone says "translate the shop", "localize my store", "add Japanese / German / French
  to the shop", "translate the items", "translate the storefront", "make the shop multilingual",
  "localize the catalog", "add a language to the site", "translate the FAQ", or "why is my shop
  still in English". Covers the two separate mechanisms — item `name`/`description` locale maps via
  `catalog update-items`, and landing strings via `shopbuilder add-language` +
  `update-many-localization` — which take different locale-code formats and are the most common way
  a half-translated shop happens. Also covers detecting what is genuinely translated (the Store API
  falls back to the default locale silently, so a read that looks translated may not be), stale
  template translations that must be overwritten rather than skipped, and the parts that cannot be
  translated from the CLI at all.
metadata:
  owner: a.springut
  domain: store
  status: draft
---

# Translating a shop

A shop is two independent surfaces with two unrelated localization mechanisms. Translating one and
not the other is the default failure — the storefront renders in Japanese around item cards that
are still English.

| Surface | Where text lives | Written with | Locale code |
| --- | --- | --- | --- |
| Catalog items | a locale map on the item | `catalog update-items` | short — `ja`, `de` |
| Storefront landing | the localization store, keyed `L:<uuid>` | `shopbuilder update-many-localization` | five-char — `ja-JP`, `de-DE` |

**The code formats are not interchangeable.** `ja` on a landing and `ja-JP` on an item both fail
quietly rather than loudly. See [references/locales.md](references/locales.md).

## Prerequisites

```bash
export XSOLLA_API_KEY=<project-scoped key>   # xsolla publisher create-api-key
```

Run every command from the directory holding `.xsolla.json` — that is where `project_id` comes
from. From anywhere else the catalog commands fail with `missing --project-id`.

Catalog *writes* are Basic Auth and need `XSOLLA_API_KEY`. Catalog *reads* of the storefront
(`list-catalog-items`) are public and work without it.

## Order to call things in

### 1. Find out what is actually translated

Do not trust a read. The Store API **falls back to the default locale silently** — asking for
`--locale ja` on an untranslated item returns the English text with no marker. Identical text means
"untranslated *or* translated identically", and only the admin record can tell them apart.

```bash
xsolla catalog list-catalog-items --limit 50 --locale en -o json > en.json
xsolla catalog list-catalog-items --limit 50 --locale ja -o json > ja.json
```

Diff `name` and `description` per SKU. Report the ambiguity rather than claiming coverage.

### 2. Translate the items

Read each item first, then send the **complete body** back with the new locale added. Every field
you care about must be present in the write:

```bash
xsolla catalog get-item-by-sku --sku emberforge_blade -o json

xsolla catalog update-items \
  --item-sku emberforge_blade --sku emberforge_blade \
  --name '{"en":"Emberforge Blade","ja":"エンバーフォージの刃"}' \
  --description '{"en":"Legendary sword skin.","ja":"伝説の剣スキン。"}' \
  --prices '[{"amount":4.99,"currency":"USD","is_default":true,"is_enabled":true}]' \
  --groups '["siege-supply"]' --is-enabled --is-show-in-store
```

`--name` and `--description` are locale→string maps. Adding a locale means **rewriting the whole
map**, so carry the existing languages through or you delete them.

`description` is mandatory and must be at least one character in *every* locale you send. An item
with no description cannot be name-translated without inventing one — flag that to the user rather
than making copy up silently.

### 3. Translate the storefront

```bash
xsolla shopbuilder list-websites -o json                    # find the slug
xsolla shopbuilder add-language --slug <slug> --language ja-JP
xsolla shopbuilder get-structure    --slug <slug> -o json   # which L: ids the pages use
xsolla shopbuilder get-localization --slug <slug> -o json   # the text behind those ids
```

Walk the page blocks for every `{"id":"L:<uuid>"}`, look each one up in the localization store, and
build one batch write. The payload shape is exact and a wrong key silently writes an empty string —
[references/payloads.md](references/payloads.md) has it, along with the scope rules.

Block text is **HTML**. Translate the text and leave the markup identical, inline spans included.

### 4. Verify by reading back

Re-fetch and compare against what you sent, per string. `"ok": true` is not evidence — one of these
endpoints returns success while writing nothing readable.

## Rules that bite

**Template landings ship stale pre-translated locales.** A Site Builder landing created from a
template already has `ja-JP` text for its stock copy. Once anyone edits the English, that Japanese
is silently wrong — a card reading "Pay as you go" can carry a `ja-JP` value meaning "Official
store". Never skip a string because it already has a translation; compare it against the *current*
English and overwrite.

**Asset URLs live in the localization store too.** SEO og:image and similar come back as ordinary
localized strings. Skip anything starting with `http` — a translated URL is a broken image.

**Broken source English propagates.** Template copy is often truncated mid-sentence or describes a
different game. Translate the intent and tell the user which strings need an English fix, rather
than rendering the damage faithfully into six languages.

**Item group names cannot be translated from the CLI.** There is `catalog admin-create-group` but no
update. A group stays English in every API response even when its storefront heading is translated.
Publisher Account only.

**The project's `locale_list` is not required** and not reachable from the CLI. See
[references/payloads.md](references/payloads.md#project-locale_list).

## Writing the translations

You are the translator — there is no translation API in this path.

- Match the register of the surface: item flavor text is game copy, FAQ answers are support copy.
  For anything Xsolla-facing, the `ux-write` skill carries the voice rules.
- Keep proper nouns and game titles in Latin script unless the user asks otherwise.
- Preserve every HTML tag, attribute and entity exactly.
- Translate consistently across surfaces: an item called 攻城物資 in the catalog must not be 包囲物資
  in the storefront heading that lists it.
- Do not machine-transliterate every name into katakana by reflex. Decide per item whether the name
  is a word (translate it) or a brand (leave it).
