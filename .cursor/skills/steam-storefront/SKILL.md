---
name: steam-storefront
description: Generate an Xsolla Shop Builder storefront from a Steam store listing with `xsolla shopbuilder` — parse the listing, generate pages/blocks/copy/theme from it, finalize the landing type, and verify the result. Use when turning a Steam (or Google Play) store page into a website or webshop, onboarding a game from its existing store listing, bootstrapping a landing from a game URL, or asked to "import from Steam", "build a site from this Steam link", or "generate a storefront for <game>".
metadata:
  owner: a.springut
  domain: site-builder
  status: draft
---

# Storefront from a Steam listing

Publisher Account's builder has a **Single game** page template that takes a Steam link and
generates the description, images and styling from it. These commands are that feature's
backend, so this is an import, not a from-scratch build: one call turns a listing into
pages, blocks, copy and a theme.

Four commands do the work:

| Command | What it does |
| --- | --- |
| `parse-listing` | Reads the listing's metadata. Mutates nothing — the dry run. |
| `generate-structure` | The import. Turns the listing into pages, blocks, copy, styling. |
| `add-template` | Optional. Adds one more generated section (`home`, `store`, `news`). |
| `create-portal` | Alternative bootstrap: single-page/hub layout, theme from the game icon. |

> **Requires an unreleased CLI.** These four commands ship with the store-listing import
> operations on the `feat/agentic-onboarding` branch of `xsolla/xsolla-cli`, not with the
> released 1.9.x. Check first: `xsolla shopbuilder parse-listing --help`. If that is an
> unknown command, build and install that branch (`make install`) before following this
> skill — every step below depends on it.

> **Three things in this API are unverified** — reverse-engineered against a live portal,
> not an official spec. `parse-listing`'s request shape is sent as query parameters but was
> documented as a GET with a JSON body; its response shape is unrecorded; and
> `create-portal`'s payload is unrecorded, so `--type`/`--target` there are a guess. If a
> call fails in a way that looks like the wrong request shape, that is why. Report it
> rather than working around it silently.

## Before anything: confirm the project

Every command runs against one merchant/project, and importing into the wrong one creates a
real landing in someone else's project.

```
xsolla config list          # read back merchant-id and project-id
```

Show those to the user and have them confirm before you create anything. Switch with
`xsolla config set merchant-id <m>` / `xsolla config set project-id <p>`.

Auth is the Shop Builder session (a `pa-v4-token` cookie), not a project API key:

```
xsolla auth login           # preferred
```

If a command 403s with `not_enough_permissions`, the session is missing or stale: sign in at
https://publisher.xsolla.com, copy the `pa-v4-token` cookie from DevTools → Application →
Cookies, then `export XSOLLA_SHOPBUILDER_SESSION='pa-v4-token=<value>'`.

## The order to call things in

Each step produces something the next one needs, and two steps are easy to skip with no
error until much later.

### 1. Create the landing

Every one of these endpoints is keyed by an **existing** landing — the dry run included, so
this comes first, before there is anything to parse into. `--slug` is the domain label you
are claiming (e.g. `valheim` → `valheim.xsolla.site`).

```
xsolla shopbuilder create-website --slug valheim --name "Valheim" --type topup
```

`--type` accepts only `topup` at creation. That is expected — step 4 sets the real type.

### 2. Dry-run the listing

```
xsolla shopbuilder parse-listing --slug valheim --type steam \
  --target https://store.steampowered.com/app/892970/Valheim/ --json
```

The host must be **exactly** `store.steampowered.com` — no `steamcommunity.com`, no
regional or `//store.steampowered.com/app/...` variants.

**If parsing fails, stop and ask the user.** Do not substitute invented metadata: a
storefront built from a plausible-looking guess is worse than no storefront, because
nothing downstream reveals that the title, art and copy were fabricated.

### 3. Generate the structure from the listing

```
xsolla shopbuilder generate-structure --slug valheim --type steam \
  --target https://store.steampowered.com/app/892970/Valheim/
```

`import-steam` is an alias for this command.

`--type` also accepts `gplay` (with a Google Play `--target`), and `store`, `topup`,
`sellingpage`, `rfppage`, `free2play`, which generate from the project itself and take **no**
`--target`.

**`--slug` is the domain label, not the landing's `_id`.** The `landing/{slug}` endpoints are
keyed by slug; the `ui/*` block endpoints and `assets/*` are keyed by the Mongo `_id`. Send a
slug where an id belongs and the backend tries to parse it as an ObjectId and 500s.

Alternative: `create-portal --slug <slug>` builds a single-page or hub layout and derives the
theme from the game icon instead. It works **only on a landing with no type assigned** and
returns **409** once a structure exists — at which point read the existing structure and
resume, rather than deleting the landing and starting over.

### 4. Finalize the landing type — do not skip this

```
xsolla shopbuilder set-landing-type --slug valheim --type sellingpage
```

`create-website` can leave `type: null`. Without this call the landing is unconfigured: the
editor gates on a domain prompt and the preview 404s. The failure shows up minutes later,
looking like a broken import rather than a missing step. Types: `topup`, `store`,
`sellingpage`.

### 5. Verify by reading it back

```
xsolla shopbuilder get-structure --slug valheim --json
```

**The mutation response is not evidence the import worked.** Read the structure and confirm
real pages and blocks exist, with copy from the listing rather than template placeholders:

- top-level `_id` → the `--landing-id` every block command needs
- `pages[]._id` → `--page-id`
- `pages[].blocks[]._id` → `--blockid`
- `pages[].blocks[].module` → block type (`lead`, `newStore`, `faq`, …)

Then show the user the preview:

```
xsolla shopbuilder enable-preview --slug valheim
xsolla shopbuilder preview-link   --slug valheim
```

## After the import

- **Add a section**: `add-template --slug <slug> --type steam --template home|store|news`.
  Only `--type steam` is attested here.
- **Edit what was generated** — copy, images, block order, theme: the **shopbuilder** skill.
  Those commands take `--landing-id` from step 5, not `--slug`.
- **Turn it into a webshop**: a generated site has no store. Wire a `newStore` block to a
  catalog — **shopbuilder** (`references/wire-a-store.md`), and **catalog-admin** to build
  the catalog it renders.

## When it goes wrong

| Symptom | Cause |
| --- | --- |
| `500` from a block command | a slug was sent where `--landing-id` belongs |
| `403 not_enough_permissions` | Shop Builder session missing or stale — re-run `xsolla auth login` |
| `409` from `create-portal` | the landing already has a structure; read it and resume |
| Preview 404s, editor asks for a domain | `set-landing-type` was skipped (step 4) |
| Listing won't parse | host is not exactly `store.steampowered.com`, or the request shape is one of the unverified ones above |
