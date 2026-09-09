# Intake schema

The complete set of facts needed before a shop can be planned. Drives the
DoD requirement — *"the skill asks only for what is missing"* — and the
**intake completeness** metric (% of required fields held before the first write; target 100%).

Status: **draft for mentor review.** Field list is settled; the defaults and the
`newStore`/catalog column need confirmation against a live sandbox landing.

---

## How intake works

Every field is in one of three states after the skill reads the user's description:

| State | Meaning | Action |
|---|---|---|
| **Stated** | Explicit in the description | Record it. Never re-ask. |
| **Inferred** | Derivable with high confidence (e.g. "mobile gacha RPG" → platform `mobile`) | Record with a marker. Surface in the plan for confirmation — do not spend a turn on it. |
| **Missing** | Neither stated nor safely inferable | Ask. |

Only **Missing** required fields generate questions. Inferences are confirmed in bulk when
the plan is presented, which is what keeps *turns to plan approval* low.

**Batch the questions.** Ask all missing required fields in one message, grouped by section,
never one per turn. Optional fields are never asked — they get defaults, and the plan says so.

**Guessing rule.** Infer structure (page count, block choice, layout) freely — that is the
skill's job. Never invent **facts**: prices, currency codes, item names, the studio name, or
the game's actual content. A wrong price is worse than a question.

---

## A. Game info

| Field | Req | Inferable | Default | Notes |
|---|---|---|---|---|
| `game_name` | ✅ | — | none | Display name. Feeds landing `--name` and hero copy. |
| `game_genre` | ✅ | often | none | Drives block selection and tone. |
| `studio_name` | ⬜ | ✕ | omit from footer | Never invent. |
| `art_direction` | ⬜ | often | derive from genre | Free text: "dark sci-fi", "cozy pixel". Feeds theme choice. |
| `logo_asset` | ⬜ | ✕ | text wordmark | Path to a local file for `upload-asset --type image`. |
| `key_art` | ⬜ | ✕ | flat color hero | Path to a local file. Absence is expected — the epic's premise is publishers with no assets. |

## B. Audience and platform

| Field | Req | Inferable | Default | Notes |
|---|---|---|---|---|
| `platform` | ✅ | usually | none | `mobile` / `pc` / `console` / `cross-platform`. **Selects the archetype** — the single highest-leverage field. |
| `primary_regions` | ⬜ | ✕ | global | Informs `languages` and currency, not geo-restrictions (out of scope). |
| `audience_note` | ⬜ | often | omit | Free text. Tone only. |

## C. Visual style

| Field | Req | Inferable | Default | Notes |
|---|---|---|---|---|
| `colorscheme` | ✅ | ✕ | **needs confirmation** | Maps to `create-website --colorscheme`. Valid names unknown until the sandbox run — if a named-scheme list exists, offer it as a pick-one and this stops being a hard ask. |
| `theme_overrides` | ⬜ | ✕ | none | JSON for `create-website --theme`. Schema unknown; confirm on sandbox. |
| `tone` | ⬜ | often | from genre | Copywriting register: "gritty", "playful". |

> **Open:** if `--colorscheme` takes a free-form string rather than an enum, this field
> becomes inferable from `art_direction` and drops out of the required set.
> Resolve on the sandbox run before finalizing.

## D. Catalog

The heaviest section, and where intake most often stalls.

| Field | Req | Inferable | Default | Notes |
|---|---|---|---|---|
| `has_existing_catalog` | ✅ | ✕ | none | Yes → read it, do not invent. No → the fields below are needed. |
| `real_currency` | ✅ | ✕ | `USD` | ISO code. |
| `virtual_currency` | ⬜ | ✕ | none | Name + code, e.g. "Shards"/`SHD`. Required if any item is priced in VC. |
| `items[]` | ✅ | ✕ | none | Per item: `name`, `price`, `currency`, optional `description`, `image`. |
| `bundles[]` | ⬜ | ✕ | none | **Required for the live-service archetype.** Contents + bundle price. |
| `currency_packs[]` | ⬜ | ✕ | none | Typically required for `topup` landings. |

> **Never invent prices or item names.** If the description says "sell skins and a
> battle pass" with no numbers, that is a Missing field and must be asked.
> A placeholder price that reaches a live shop is the worst failure mode this skill has.

> **Scope note.** Whether the skill *creates* catalog entities (`xsolla catalog`, or the
> `catalog-admin` / `catalog-import` skills) or only *wires* an existing catalog into a store
> block is unresolved. The epic's DoD lists catalog under intake but the build step says
> "standard blocks only". Needs a ruling from the mentor — it changes the size of SB-8863
> substantially.

## E. Pages

| Field | Req | Inferable | Default | Notes |
|---|---|---|---|---|
| `page_count` | ✅ | ✅ | from archetype | Almost always inferred, never asked. |
| `pages[]` | ✅ | ✅ | from archetype | Each: `name` (1–80 chars), `path` (lowercase `a-z0-9-/`, max 80). |
| `landing_type` | ✅ | ✅ | from archetype | `topup` / `store` / `sellingpage`. See the two-step create note in the CLI reference. |
| `nav_required` | ⬜ | ✅ | true if >1 page | |

## F. Languages

| Field | Req | Inferable | Default | Notes |
|---|---|---|---|---|
| `languages[]` | ✅ | ✅ | `["en-US"]` | Locale codes. Default is safe — only asked if the description implies non-English markets. |
| `default_language` | ⬜ | ✅ | first in list | |
| `translations_provided` | ⬜ | ✕ | false | If false, non-English locales are **added but left empty** for a human. The skill must not machine-translate store copy silently. |

## G. Run context — not from the user

Collected from the environment, but part of completeness. Absent → hard stop before any write.

| Field | Source |
|---|---|
| `merchant_id` | `xsolla config list` |
| `project_id` | `xsolla config list` — **must be non-zero** |
| `slug` | Proposed by the skill from `game_name`, confirmed in the plan |
| `auth_ok` | `xsolla auth status` — non-expired token |
| `backup_path` | Written by the backup script before the first write (SB-8862) |

---

## Completeness gate

The **first write** is `create-website`. Before it, all of the following must hold:

1. Every ✅ field is Stated or Inferred — none Missing.
2. Every Inferred field appears in the plan the user approved.
3. `auth_ok` is true and `project_id` is non-zero.
4. A backup exists at `backup_path`, or the project has no landings yet (nothing to back up —
   record that fact explicitly rather than skipping the step silently).
5. The user has given explicit confirmation on the plan.

Fail any → do not write. Report which gate failed.

Instrument this: the skill logs the filled/required ratio at the gate. That log *is* the
intake-completeness metric, and it is how SB-8869 reports the number rather than estimating it.
