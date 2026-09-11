---
name: description-to-shop
description: >-
  Build a complete Xsolla Shop Builder shop from nothing but a plain-language description —
  no design, mockup, spec, or brief needed. START HERE when someone describes a game in a
  few sentences and wants a shop built: it runs a guided intake (game info, audience and
  platform, visual style, catalog, pages, languages), asks only for what is missing, writes
  a concrete plan, gets explicit approval, backs up the project, and builds the shop with
  standard blocks via `xsolla shopbuilder`. Use for "build me a shop from this description",
  "I don't have a design, just make a store", "turn this idea into a webshop", "set up a
  storefront for my game", "make a top-up page", "I need a shop but no mockups". Handles
  three archetypes — mobile single-page shop, PC multi-page portal, and live-service with
  bundles. Delivers a preview link; never publishes. For Shop Builder landings, not the
  Headless Shop / custom-frontend path (see `shop-setup` for that).
metadata:
  owner: k.shah
  domain: store
---

# Description to Shop

Turn a short, plain-language description of a game into a built Shop Builder shop,
guiding the user through every missing detail on the way.

## When to use this

Use when the user has **no design and no spec** — just a description. If they already
have a reference site, a mockup or a written brief, that is a different starting point.

This builds **Shop Builder landings** via `xsolla shopbuilder`. It is not the Headless
Shop path (custom frontend, Store API, Checkout SDK) — that is `shop-setup`.

## Prerequisites

- Xsolla CLI ≥ 1.9.4, authenticated with `xsolla auth login`
- A **test** project with Shop Builder enabled and a non-zero `project_id`
- A catalog already seeded in that project, **organised into groups** — a store block
  binds to a group, so the groups decide the storefront's sections
- No stale `XSOLLA_API_KEY` in the environment: an invalid one silently overrides a
  valid login and 401s every call
- To *view* the result: a human clicks Preview in the editor — the CLI cannot mint the token

## The flow

### 1. Read the description

Classify every field in `references/intake-schema.md` as **Stated**, **Inferred** or
**Missing**. Infer structure and styling freely — that is the job. Never infer facts.

### 2. Ask once

Batch every Missing required field into a single message, grouped by section. Never
interrogate one field per turn. Optional fields are not asked; they take defaults and
the plan says so.

### 3. Present the plan

Use the template in `references/plan-format.md`. Pages, blocks, catalog groups,
assumptions, and an explicit "not included" section. One message, whole plan.

### 4. Get explicit approval

No writes before this. An answer to an intake question is data, not consent. Changes
mean revise and re-present in full — approval of v1 never carries to v2.

### 5. Back up

```
scripts/backup-landing.sh <slug> [out-dir]
```
Captures structure, localization and assets. A project with no landings is a valid
state — record it, don't skip silently.

### 6. Build

```
scripts/build-archetype.sh <mobile|pc-portal|live-service> <slug> <name> [group=type:layout ...]
```

Or drive the pieces directly: `create-landing.sh` → `shape-page.sh` → `bind-store-section.sh`.

### 7. Hand over the preview

```
scripts/preview.sh <slug>
```
The CLI **cannot** mint a preview token — `preview-link` 403s for publisher logins. The
script prints the editor URL and the built structure; a human clicks **Preview** there to
view it. Say this plainly rather than implying a link is coming. Publishing is a separate
human step, and no CLI command for it exists.

## Archetypes

| Archetype | Shape | Default bindings |
|---|---|---|
| `mobile` | One page: header · leadGameSales · newStore · faq · footer | `currency-packs` as vertical cards |
| `pc-portal` | Home / Store / Support | `editions` large, `cosmetics` vertical |
| `live-service` | One page, two store sections | `featured-bundles` featured, `currency-packs` horizontal |

Groups are arguments, not constants — pass the user's real catalog groups.

## Hard rules

1. **Never publish.** The CLI has no publish command, so this is structural rather than
   policy — but never work around it either.
2. **Standard blocks only.** Never call `create-custom-block` or `update-ai-block`.
3. **Never invent facts.** Prices, item names, currency codes and studio names are read
   from the catalog or asked for. Structure and styling may be inferred; facts may not.
4. **Never create catalog entities.** The catalog is seeded separately. This skill reads
   it and wires it in.
5. **Back up before the first write.**
6. **Test projects only.** Never a partner's live project.
7. **Use `xsolla auth login`.** If a manual `XSOLLA_SHOPBUILDER_SESSION` copy is ever
   needed, document it and file a ticket — do not work around it in code.
8. **Never accept licensing agreements.** Accepting terms is a legal act for a person in
   Publisher Account. (They do not gate preview — that was our earlier assumption and it
   was wrong.)
9. **Use the scripts.** They encode the API's real behaviour — throttling, the prepend
   bug, silent write failures. Ad-hoc calls will get these wrong.

## Failure handling

Stop, report which step failed and what exists so far, and point at the backup. Do not
retry blindly, and do not roll back on your own initiative — a half-built landing the
user can inspect beats a silent partial rollback they cannot.

## References

| File | Contents |
|---|---|
| [`references/intake-schema.md`](references/intake-schema.md) | Every field, required vs optional, defaults, completeness gate |
| [`references/plan-format.md`](references/plan-format.md) | Plan template, approval rules, build order |
| [`references/cli-commands.md`](references/cli-commands.md) | All 43 commands, the verified block catalog, catalog binding, and the four behaviours that only show up at runtime |
| [`scripts/`](scripts/) | `lib.sh`, `backup-landing.sh`, `create-landing.sh`, `shape-page.sh`, `bind-store-section.sh`, `build-archetype.sh`, `preview.sh`, `seed-test-catalog.sh` |
| [`evals/`](evals/) | Twelve eval inputs, run log |
