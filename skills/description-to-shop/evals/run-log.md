# Eval run log

Inputs are in [`test-descriptions.md`](test-descriptions.md). Targets from SB-8786:
intake completeness 100%, run success ≥ 4/5, manual interventions ≤ 2.

## What has actually been run

**Three build-layer runs**, driving `scripts/build-archetype.sh` directly against
test project `315423` (merchant `936457`). These exercise the build half of the
skill — landing creation, page shaping, block placement, catalog binding — and
each was verified against `get-structure`, not against exit codes.

They are **not** end-to-end skill runs. No description was parsed, no intake
happened, no plan was approved. Those require a human on the other side of the
conversation and are the outstanding work for this ticket.

| # | Archetype | Slug | Result | Structure verified | Interventions | Notes |
|---|---|---|---|---|---|---|
| B1 | mobile | `tidepool-a3` | pass | `/` → header · leadGameSales · newStore[currency-packs] · faq · footer | 0 | Clean on the paced build |
| B2 | pc-portal | `voidwall-a1` | pass | `/` → header · leadGameSales · description · gallery · footer<br>`/store` → header · newStore[editions] · newStore[cosmetics] · footer<br>`/support` → header · faq · requirements · footer | 0 | Three pages, two bound store sections |
| B3 | live-service | `nullpoint-a1` | pass | `/` → header · leadGameSales · newStore[featured-bundles] · newStore[currency-packs] · faq · footer | 0 | Two store sections on one page |

All three were then **visually confirmed in a live preview**, opened by clicking
Preview in the Shop Builder editor (the CLI cannot mint a preview token):

- **B1 mobile** — 100/550/1200 Shards at $0.99/$4.99/$9.99, plus Ember Skin,
  Frostline Skin and Wave Emote priced at 450/450/150 Shards, then the FAQ.
- **B2 pc-portal** — `/store` shows Voidwall $29.99 and Voidwall Deluxe $49.99 in
  the large layout, cosmetics below in the vertical layout.
- **B3 live-service** — Frostline Bundle $19.99 in the featured layout with its
  three contents and a carousel across the bundle group.

Nothing was published; all eight landings remain Draft.

### Failures found and fixed during these runs

Worth keeping — each one would have silently corrupted a build:

| Symptom | Cause | Fix |
|---|---|---|
| Page built in reverse order | `add-block` prepends although its help says it appends | Always pass explicit `--index` |
| Page ended up empty, no error | Unpaced write burst is throttled and silently dropped | Pace writes, verify, one slower repair pass |
| `structure` returned nothing mid-script | `head -c1` in a pipeline + `pipefail` turned SIGPIPE into failure | Substring test instead of a pipeline |
| Store blocks never bound | `… \| while read` runs in a subshell; the array was discarded | Process substitution |
| Store rendered empty skeletons forever | Item type `virtual_currency_package` is not a real value; the API stored it verbatim | Validate against the four real types before writing |
| Three stale store sections left live | A new `newStore` block has four sections; we patched only `components[0]` | Replace the whole `components` array |
| Binding "verified" while broken | The check re-read the same path it had just written | Verify every section, and confirm in a live preview |
| `python3 -` got no JSON | The heredoc and the piped data both wanted stdin | Pass the structure by file path |
| Seed script reported everything as failed on re-run | Classified on exit code, and "already exists" wording differs per entity | Classify on output, treat "exists" as success |

## Outstanding

Nine of the twelve inputs, plus the three conversational runs of the inputs above.
Each needs a human to answer intake questions and approve a plan, so they cannot be
self-driven honestly. Per-run, record:

| Run | Input | Archetype hit | Intake % at gate | Turns to approval | Structural rework | Manual interventions | Failures / notes |
|-----|-------|---------------|------------------|-------------------|-------------------|----------------------|------------------|
| 1 | M1 | | | | | | |

**Record verbatim:** wrong archetype chosen; a price or item name invented; a write
before approval; an empty-string localization overwrite; a missing backup; any
`create-custom-block` call; any attempt to publish.
