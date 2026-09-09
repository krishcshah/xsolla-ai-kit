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

> **Status: work in progress (SB-8786).** Intake, plan format, and the CLI surface are
> drafted. The build procedure is blocked on the standard block catalog, which can only be
> read off a live landing. Do not rely on this skill until this notice is removed.

Turn a short, plain-language description of a game and its shop into a built Shop Builder
shop, guiding the user through every missing detail along the way.

## When to use this

Use when the user has **no design and no spec** — just a description. If they already have a
reference site, a mockup, or a written brief, that is a different (easier) starting point.

This skill builds **Shop Builder landings** via `xsolla shopbuilder`. It is not the
Headless Shop path — custom frontend, Store API, Checkout SDK — which is `shop-setup`.

## The flow

1. **Read the description.** Classify every intake field as Stated, Inferred, or Missing.
2. **Ask once, in a batch,** for the Missing required fields only.
3. **Present the plan** — pages, blocks, catalog, assumptions, exclusions.
4. **Get explicit approval.** No writes before this.
5. **Back up** the current configuration.
6. **Build** with standard blocks.
7. **Hand over a preview link.** Publishing is a human step in Publisher Account.

## Hard rules

- **Never publish.** The CLI has no publish command, so this is structural, not just policy —
  but never work around it either.
- **Standard blocks only.** Never call `create-custom-block` / `update-ai-block`.
- **Never invent facts.** Prices, item names, currency codes and studio names are asked for,
  never guessed. Structure may be inferred; facts may not.
- **Back up before the first write.**
- **Test projects only.** Never a partner's live project.
- **Use `xsolla auth login`.** If a manual `XSOLLA_SHOPBUILDER_SESSION` copy is needed,
  document it and file a ticket — do not work around it in code.

## References

| File | Contents |
|---|---|
| [`references/intake-schema.md`](references/intake-schema.md) | Every field, required vs optional, defaults, and the completeness gate |
| [`references/plan-format.md`](references/plan-format.md) | Plan template, approval rules, post-approval build order |
| [`references/cli-commands.md`](references/cli-commands.md) | All 43 `xsolla shopbuilder` commands, the two-identifier trap, destructive-write warnings |
| [`evals/test-descriptions.md`](evals/test-descriptions.md) | Twelve eval inputs and the run-log template |

## Prerequisites

- Xsolla CLI ≥ 1.9.4, authenticated with `xsolla auth login`
- A **test** project with Shop Builder enabled, and a non-zero `project_id` in `xsolla config list`
