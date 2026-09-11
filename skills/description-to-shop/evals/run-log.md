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

All three stopped at the same place: **preview unavailable**, because the
merchant's licensing agreements are unsigned. The shops are built and inspectable;
there is no link to hand over.

### Failures found and fixed during these runs

Worth keeping — each one would have silently corrupted a build:

| Symptom | Cause | Fix |
|---|---|---|
| Page built in reverse order | `add-block` prepends although its help says it appends | Always pass explicit `--index` |
| Page ended up empty, no error | Unpaced write burst is throttled and silently dropped | Pace writes, verify, one slower repair pass |
| `structure` returned nothing mid-script | `head -c1` in a pipeline + `pipefail` turned SIGPIPE into failure | Substring test instead of a pipeline |
| Store blocks never bound | `… \| while read` runs in a subshell; the array was discarded | Process substitution |
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
