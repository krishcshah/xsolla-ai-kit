# Plan format and confirmation gate

The plan is the contract between intake and the build. It is shown once, in full,
before the first write, and the user's explicit approval of it is the only thing that
authorizes any mutation.

Status: **draft for mentor review.** Template is settled; block names in the examples
are placeholders until the sandbox run confirms the real catalog.

---

## Rules

1. **One message, whole plan.** No drip-feed, no "shall I start with page one?".
2. **Concrete, not aspirational.** Real page paths, real block sequences, real prices,
   real locale codes. If it is not concrete enough to execute, intake is not finished.
3. **Mark every inference.** Anything the user did not state carries a `~` and is listed
   again in *Assumptions*. This is where inferred fields get confirmed — the mechanism
   that keeps turn count down without the skill guessing behind the user's back.
4. **State what will not happen.** The "Not included" section prevents the most expensive
   failure mode: the user believing the shop is live.
5. **No writes before approval.** Reads (`get-structure`, `list-websites`, `config list`)
   are fine and expected. `create-website` is the boundary.

---

## Template

```markdown
## Plan: <Game Name> shop

**Archetype:** <mobile single-page | PC multi-page portal | live-service with bundles>
**Landing:** <slug>.xsolla.site · type `<topup|store|sellingpage>` · scheme `<colorscheme>`
**Project:** merchant <id> / project <id>   ← test project
**Languages:** en-US ~(+ de-DE, empty, for a human to fill)

### Pages
| # | Page | Path | Blocks (in order) |
|---|------|------|-------------------|
| 1 | Home | /    | hero → newStore → faq → footer |
| 2 | ~Support | ~/support | ~lead → ~faq |

### Catalog
| Item | Price | Currency | Notes |
|------|-------|----------|-------|
| Starter Pack | 4.99 | USD | |
| ~500 Shards  | ~0.99 | ~USD | ~inferred pack tier |

<or: "Wiring existing catalog — N items, read from project <id>. No catalog entities created.">

### Assumptions (~)
- Platform is mobile → single-page archetype.
- Support page inferred from "players need help with purchases".
- Shard pack tiers inferred; **prices are placeholders and need your numbers.**

### Not included
- **Nothing is published.** The result is a preview link. Publishing is done by a
  human in Publisher Account.
- No custom blocks — standard blocks only.
- No external domain; the shop lives on <slug>.xsolla.site.
- German copy will be empty until someone translates it.

### Before the first write
- Backup: `<path>` (or: project has no existing landings — nothing to back up)
- Writes planned: ~<N> CLI calls

---
**Approve this plan?** Reply *approve* to build, or tell me what to change.
```

---

## The confirmation gate

**Approval must be explicit and must be about this plan.** Accept a clear affirmative —
"approve", "yes", "go ahead", "build it". Do not treat as approval:

- silence, or a message that changes the subject
- an answer to an intake question ("it's 4.99") — that is data, not consent
- approval given earlier in the session for a *different* plan
- enthusiasm about the idea ("this looks great") without an instruction to proceed

**Ambiguous → ask once, plainly.** One clarifying question, not a re-render of the plan.

**Changes → revise and re-present in full.** Do not build the approved parts of a plan the
user is still editing. Re-present the whole plan, not a diff, so a single message always
holds the complete current contract. Approval of plan v1 never carries to v2.

**Approval covers this plan only.** It authorizes the writes listed. It does not authorize
publishing (which the CLI cannot do anyway), deleting anything, touching another landing,
or a second build run. A new run needs a new plan and new approval.

---

## After approval

Order matters, and the first two steps are safety, not construction:

1. **Back up** — `get-structure`, `get-localization`, `list-assets` to disk (SB-8862).
   If the project has no landings, record that instead of skipping silently.
2. **Re-check the gate** — auth valid, `project_id` non-zero. Cheap; catches an expired token
   before a half-built landing exists.
3. `create-website` → **`set-landing-type` immediately** (see the CLI reference: `create-website`
   can leave `type:null`, which leaves the landing unconfigured and 404s the preview).
4. `get-structure --json` → cache `_id`, page `_id`s. Every later call needs these.
5. Pages, then blocks per page, in plan order.
6. Localization last — content edits are the most destructive step
   (see the empty-string trap in the CLI reference).
7. `enable-preview` → `preview-link` → hand the link to the user.

**On failure mid-build:** stop, report which step failed and what exists so far, and point at
the backup. Do not retry blindly and do not roll back on your own initiative — a half-built
landing the user can see beats a silent partial rollback they cannot.

**Manual interventions after this point are the SB-8869 metric** (target ≤ 2), so log every
place the run needed a human.
