# description-to-shop

Builds an Xsolla Shop Builder shop from a plain-language description. No design,
no mockup, no written brief — the skill asks for what's missing, writes a plan,
gets approval, and builds.

Tracking: **SB-8786**.

## Prerequisites

1. **Xsolla CLI ≥ 1.9.4** — `xsolla --version`
2. **Logged in** — `xsolla auth login` (OAuth2 + PKCE, token in the OS keychain)
3. **A test project with Shop Builder enabled.** Any project you own works; these
   are public APIs and no special test merchant is needed. Confirm with
   `xsolla shopbuilder list-websites --merchant-id <m> --project-id <p>` — a
   response rather than a 404 means it's enabled.
4. **A seeded catalog, organised into groups.** Store blocks bind to a *group*,
   so groups decide the storefront's sections. `scripts/seed-test-catalog.sh`
   creates a realistic five-group fixture for testing.
5. **No stale `XSOLLA_API_KEY`** in the environment for Shop Builder work. An
   invalid one silently overrides a valid login. Catalog commands *do* need one
   (Basic auth); Shop Builder commands must not see it. The scripts strip it.

## Happy path

```bash
export XSOLLA_MERCHANT_ID=<merchant>
export XSOLLA_PROJECT_ID=<project>

# 1. one-time: a catalog to wire into the shop (needs XSOLLA_API_KEY)
XSOLLA_API_KEY=<key> ./scripts/seed-test-catalog.sh

# 2. back up anything that already exists
./scripts/backup-landing.sh <existing-slug>

# 3. build
./scripts/build-archetype.sh mobile tidepool "Tidepool"

# 4. hand over the preview link
./scripts/preview.sh tidepool
```

Step 3 prints each page as it's shaped and each store section as it's bound, and
verifies both against `get-structure`. A build takes a minute or two — the API is
throttled and the scripts pace themselves deliberately.

## Known limitations

- **The CLI cannot produce a preview link.** `enable-preview` and `preview-link`
  return 403 on a publisher login. This is *not* about licensing agreements —
  previews work with them unsigned. The editor mints a short-lived, per-landing,
  browser-session token that the CLI has no equivalent for. A build therefore
  ends with "built and verified"; a human clicks **Preview** in the editor to
  look at it. `scripts/preview.sh` prints the editor URL and the built structure.
- **The editor canvas can show "No items found"** for a store section that
  renders fine in the live preview. Trust the preview, not the canvas.
- **The skill never publishes.** There is no publish command in the CLI at all.
  The deliverable is a preview link.
- **Standard blocks only.** 15 modules, listed in `references/cli-commands.md`.
  Custom/AI blocks are deliberately out of scope.
- **The skill never creates catalog entities.** It reads an existing catalog.
- **Only four store item types exist**: `virtual_good`, `virtual_currency`,
  `bundle`, `game_key`. Anything else is accepted by the API and silently
  renders nothing. `set-store-sections.sh` validates before writing.
- **Block templates are not discoverable.** No enumeration endpoint; an invalid
  name returns a bare HTTP 500. The catalog in the reference was brute-forced and
  may be incomplete, and may differ by landing type.
- **`add-block` prepends** despite documenting the opposite, so every add needs an
  explicit `--index`. The scripts handle this; ad-hoc calls will not.
- **Throttling is silent.** A rapid burst of writes returns success and creates
  nothing. Always verify against `get-structure`, never against exit codes.
- **Localization can blank strings.** `update-many-localization` writes an empty
  string — returning 200 — if the value shape isn't exactly
  `{"translation": "..."}`. This is why the backup captures localization.
- **Non-English copy is left empty.** The skill adds locales but does not machine
  translate store copy.

## Layout

```
SKILL.md                       the skill itself
README.md                      this file
references/intake-schema.md    what to collect, and the completeness gate
references/plan-format.md      plan template and approval rules
references/cli-commands.md     43 commands, block catalog, runtime behaviour
scripts/                       build and safety scripts
evals/                         test inputs and the run log
```
