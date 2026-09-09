# `sb` — Site Builder commands

Zero-dependency Node commands that the `site-builder-pages` and `site-builder-blocks` skills
invoke. Node 18 or newer; no `package.json`, no install, no build.

```bash
node sb.mjs --list
node sb.mjs --help create_block
node sb.mjs get_site '{"merchantId":"…","projectId":"…","domain":"sb-xxxx-site"}'
```

## Why this exists at all

This repository is otherwise skills-only, and `CONTRIBUTING-skills.md` asks skills to describe
intent rather than raw HTTP. Site Builder is the exception, because three of its behaviours cannot
be described safely enough to hand to a model:

- A federated block's payload puts the module name in `values.blockId` and sends `"federated"` on
  the wire, and an image URL has to be routed into `resources.mediaValues[<image id>].src` while the
  field keeps the image id. A payload built the obvious way is accepted by the API and renders
  nothing, with no error anywhere.
- `create_block` is two calls with a visible orphan between them. Split across two commands, an
  interrupted run leaves the orphan as the *default* outcome.
- Reading a translation needs two endpoints combined, because one has the text and the other has
  the id.

Behaviour that can be described in prose stayed in the skills.

## Layout

| Path | What |
| --- | --- |
| `sb.mjs` | Entry point: token guard → schema validation → editor freeze → handler → audit → exit code |
| `lib/config.mjs` | Base URLs and credentials, resolved once. Production defaults only |
| `lib/http.mjs` | The only place a request is built; per-origin clients, dry-run recording |
| `lib/schema.mjs` | JSON Schema validator sized to the keywords `schemas.json` actually uses |
| `lib/schemas.json` | The 44 tool input schemas, verbatim from the MCP server |
| `lib/identity.mjs` | `structure/internal` and the ids resolved from it, cached per run |
| `lib/patch.mjs` | Dot-notation → JSON Patch, and the batch envelope |
| `lib/federated.mjs` | Publication catalog, `default-data.json`, the media side-channel merge |
| `lib/localization.mjs` | Hydrated + raw translation read, scope, the upsert guard |
| `lib/theme.mjs` | Theme primitives merge |
| `lib/modules.mjs`, `lib/modules.json` | Native module snapshot: names, UI names, version ceilings |
| `lib/halt.mjs` | Editor freeze state, persisted because a CLI has no resident process |
| `lib/audit.mjs` | `POST /api/logs` with `actor: 'ai'` — the record that an agent made the change |
| `lib/notify.mjs`, `lib/trim.mjs`, `lib/errors.mjs`, `lib/registry.mjs` | Notifications, response shaping, error types and exit codes, the command table |
| `tools/*.mjs` | One module per domain, exporting a handler per command name |
| `test/*.test.mjs` | `node --test`, no network — fetch is injected |

## Tests

```bash
cd scripts/site-builder && node --test
```

Nothing here touches the network. `test/fixtures/default-data.gallery.json` is a real production
payload, so the media side-channel is tested against the shape it actually has rather than an
invented one.

`SB_DRY_RUN=1` covers the rest: it performs reads and prints the exact method, URL, headers and
body of every mutation instead of sending it.

## Snapshots that go stale

Two files are copies of platform data this repository cannot import:

- `lib/schemas.json` — the tool input schemas.
- `lib/modules.json` — native module names and version ceilings, derived from the platform's block
  metadata.

Neither has a runtime source here, so both drift silently as the platform changes. If the API
rejects a module or a version that these files consider valid, trust the API and regenerate.

## Deliberate omissions

- **Native and federated block-payload validation.** The native schemas live in a package this
  repository cannot reach. The federated structural walk was a known-inadequate stopgap that missed
  required fields, enums and array item shapes whenever defaults were empty, so it was not worth
  reproducing. The API rejects bad payloads instead.
- **The theme engine.** Only base primitives are sent; the server recomputes everything derived.
- **MCP protocol surface.** `outputSchema`, `tools/list`, `logging/setLevel`.

`--list` is the authority on which commands exist. Anything not on it fails with "Unknown tool"
rather than appearing to work.
