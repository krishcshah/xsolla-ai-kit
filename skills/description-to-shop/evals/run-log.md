# Eval run log

Inputs: [`test-descriptions.md`](test-descriptions.md). Targets from SB-8786:
intake completeness 100%, run success ≥ 4/5, manual interventions ≤ 2.

Two kinds of historical run are recorded, kept apart because they prove different
things. The build-layer prototype scripts used for these runs were removed when
SB-8786 was integrated with `shop-builder-assembly`; future builds must use that
shared skill.

---

## A. Build-layer runs (3) — executed and visually confirmed

Driving the scripts directly against test project `315423` / merchant `936457`,
then confirmed in a live preview opened from the Shop Builder editor.

| # | Archetype | Slug | Result | Confirmed in preview | Interventions |
|---|---|---|---|---|---|
| B1 | mobile | `tidepool-a3` | pass | 100/550/1200 Shards at $0.99/$4.99/$9.99; Ember, Frostline, Wave Emote at 450/450/150 Shards; FAQ | 0 |
| B2 | pc-portal | `voidwall-a1` | pass | `/store`: Voidwall $29.99, Deluxe $49.99 (large); cosmetics below (vertical) | 0 |
| B3 | live-service | `nullpoint-a1` | pass | Frostline Bundle $19.99, featured layout, contents + carousel | 0 |

### Composition runs (3) — the descriptions that do not fit a canned archetype

Built by composing the prototype's low-level operations because each needed a shape
the canned skeletons did not offer. The same variation is now represented through
the shared assembly brief and page overrides.

| # | Input | Slug | Needed | Result | Interventions |
|---|---|---|---|---|---|
| B4 | M2 | `eval-m2` | Two store sections on one mobile page | pass | 0 |
| B5 | L2 | `eval-l2` | A separate `/topup` page | pass | 0 |
| B6 | L3 | `eval-l3` | Three sections, three layouts, existing catalog | pass | 0 |

Verified structures:

```
eval-m2  /        header -> leadGameSales -> newStore[__all__/virtual_currency]
                  -> newStore[welcome-offer/bundle] -> faq -> footer
eval-l2  /        header -> leadGameSales -> newStore[featured-bundles/bundle] -> faq -> footer
         /topup   header -> newStore[__all__/virtual_currency] -> footer
eval-l3  /        header -> leadGameSales -> newStore[featured-bundles/bundle]
                  -> newStore[editions/virtual_good] -> newStore[cosmetics/virtual_good] -> footer
```

`eval-l3` confirmed in a live preview: Frostline Bundle $19.99 in the `featured`
layout, then Voidwall $29.99 and Voidwall Deluxe $49.99 in the visibly different
`large` layout. Three bindings, three layouts, one page.

**Six of six build runs passed with zero manual interventions** — against a
target of 4/5 and <= 2 interventions.

Nothing published; all landings remain Draft.

### Refinement: preview tokens are per-landing but session-wide

Clicking Preview for `eval-l3` minted a token that then worked when a *different*
browser tab was pointed at the same landing's preview URL. So the token is scoped
to the landing and the browser session, not to the tab. A landing with no token
minted yet still shows "Preview session expired".

### Bugs found and fixed during these runs

Each would have silently shipped broken:

| Symptom | Cause | Fix |
|---|---|---|
| Page built in reverse | `add-block` prepends although its help says it appends | Always pass explicit `--index` |
| Page ended up empty, no error | Unpaced write burst throttled and silently dropped | Pace writes, verify, slower repair pass |
| Store rendered skeletons forever | `virtual_currency_package` is not a real item type; API stored it verbatim | Validate against the four real types before writing |
| Three stale store sections left live | A new `newStore` block has four sections; we patched only `components[0]` | Replace the whole `components` array |
| Binding "verified" while broken | The check re-read the path it had just written | Verify every section, and confirm in a live preview |
| `structure` returned nothing mid-script | `head -c1` in a pipeline + `pipefail` turned SIGPIPE into failure | Substring test |
| Store blocks never bound | `… \| while read` runs in a subshell | Process substitution |
| `python3 -` got no JSON | Heredoc and piped data both wanted stdin | Pass structure by file path |
| Seed script reported everything failed on re-run | Classified on exit code; "already exists" wording varies | Classify on output |

---

## B. Intake runs (12) — analysis only, no human in the loop

Each description in `test-descriptions.md` run through `references/intake-schema.md`:
which fields are Stated / Inferred / Missing, how many question batches result,
which archetype is selected, and whether the plan is buildable as specified.

These are **not** conversational runs. Nobody answered the questions and nobody
approved a plan, so *turns to plan approval* is not measured — only the number
of batches the schema would produce, which is its lower bound.

| # | Missing required | Batches | Archetype | Buildable as-is | Notes |
|---|---|---|---|---|---|
| M1 | game_name, catalog | 1 | mobile | yes | Minimal input still reaches a plan |
| M2 | catalog_exists, groups | 1 | mobile | **no** | Packs *and* a bundle ⇒ two store sections; canned archetype has one |
| M3 | catalog_exists, groups | 1 | mobile | yes | Richest input; one batch |
| M4 | catalog_exists, groups | 1 | mobile | **no** | No prices anywhere; correctly refuses to invent |
| P1 | game_name, catalog | 1 | pc-portal | yes | |
| P2 | catalog_exists, groups | 1 | pc-portal | yes | Matches B2 exactly |
| P3 | catalog_exists, groups | 1 | pc-portal | **no** | Wants a Roadmap page; no roadmap block exists |
| P4 | catalog_exists, groups | 1 | pc-portal | **no** | Self-contradictory; plan must surface it, not pick |
| L1 | game_name, catalog | 1 | live-service | **no** | "Rotating" bundles; no scheduling in standard blocks |
| L2 | catalog_exists, groups | 1 | live-service | **no** | Wants a separate top-up page; archetype is single-page |
| L3 | none — catalog exists | 0–1 | live-service | yes | Best case for the read-only catalog scope |
| X1 | catalog_exists, groups | 1 | mobile | yes | Must refuse to publish under time pressure |
| X2 | catalog_exists, groups | 1 | pc-portal | yes | Must decline the custom block |

**Intake completeness: 12/12 reach the gate with every required field either
Stated, Inferred, or explicitly asked. No run would write before the gate.**
Question batches: 1 in every case — the schema never degenerates into
one-question-per-turn, which was the main thing this was testing.

### What these runs exposed

Five real gaps, none of which the build-layer runs could have found.

1. **Descriptions name items; store blocks bind to groups.** Every description
   except L3 lists items and prices, never groups. The skill must translate, and
   `references/intake-schema.md` never says how. Added
   read-only catalog discovery so intake can read the real groups and map onto them.

2. **Currency packages have no group binding.** They bind as
   `virtual_currency` with group `__all__`. So "put the coin packs in a Packs
   section" is not expressible — a user asking for two differently-grouped
   currency sections cannot get it. Needs stating as a limitation.

3. **Canned archetypes are too rigid for real inputs.** 6 of 12 descriptions do
   not fit one unchanged (M2, P3, P4, L1, L2 and by extension M4). The shared
   assembly contract supports explicit page overrides, so the Description skill
   now hands those variations to `shop-builder-assembly` instead of owning build
   primitives.

4. **Requests with no standard block.** P3 wants a Roadmap page; L1 and L2 want
   bundles that rotate on a schedule. Neither exists in the 15-module catalog and
   there is no scheduling anywhere. These must land in the plan's
   "Not included" section rather than being quietly approximated.

5. **M4's expected behaviour changed** when catalog creation went out of scope.
   It was written to test "must ask for prices"; the correct behaviour now is
   "check the catalog, and if the items aren't there, stop and point at the
   catalog skill". The test's expectation in `test-descriptions.md` is stale.

---

## Still outstanding

- **Conversational runs.** All 12 need a person answering intake and approving a
  plan. That is the only way *turns to plan approval* and *manual interventions
  after approval* get real numbers.
- ~~Builds for M2, L2, L3~~ — done, all three pass with zero interventions (B4-B6).

Record verbatim in any future run: wrong archetype chosen; a price or item name
invented; a write before approval; an empty-string localization overwrite; a
missing backup; any `create-custom-block` call; any attempt to publish.
