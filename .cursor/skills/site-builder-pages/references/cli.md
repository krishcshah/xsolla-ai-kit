# The `sb` command — environment, exit codes, and limits

## Invocation

```bash
SB="${CLAUDE_PLUGIN_ROOT:-.}/scripts/site-builder/sb.mjs"
node "$SB" <command> '<json-args>'
```

Node 18 or newer. No dependencies, no install step, no build.

Arguments are a single JSON object matching the command's schema exactly — `node "$SB" --help
<command>` prints the fields, types, defaults and descriptions from that schema, so it never
drifts from what the command actually accepts.

## Environment

| Variable | Required | Meaning |
| --- | --- | --- |
| `SB_TOKEN` | for anything touching the backend | Site Builder editor token |
| `SB_BASE_URL` | no | Defaults to `https://sitebuilder.xsolla.com` |
| `SB_CUSTOM_URL` | no | Overrides the base URL **and** sets `x-custom-api-target`, which redirects server-generated AI-block hosts at the same target |
| `SB_STORE_URL` | no | Defaults to `https://store.xsolla.com/api/v2` |
| `SB_BLOCKS_SERVICE_URL` | for federated blocks only | Publication service base URL. No default — see below |
| `SB_DRY_RUN` | no | `1` performs reads and prints the mutations instead of sending them |
| `SB_INSECURE_TLS` | no | `1` skips certificate verification. Refused when the target is production |

Two commands need no token at all, because they read bundled data: `list_block_modules` and
`get_block_schema` (for a native module).

## Exit codes

| Code | Meaning | What to do |
| --- | --- | --- |
| `0` | Done | — |
| `1` | Rejected before anything was sent — bad arguments, a business rule, a missing token | Fix the input. Nothing changed. |
| `2` | The API refused, or was unreachable | Read the status. Usually auth, a wrong id, or the target being down. |
| `3` | **Partial write** | Something exists in a state nothing reads. The message names the id and the fix. Do not re-run the command — you will create a duplicate. |

Every error that has a known remedy names it, in the same style the tool errors did: "call
`get_block_schema` first", "call `list_block_modules`", "call `get_block_translations`". Follow the
pointer rather than guessing.

## Dry runs

`SB_DRY_RUN=1` still performs reads, because resolving a site id or a page's block list needs
them, so a token is still required. Mutations are collected and printed under `dryRunRequests`
with the token redacted, showing the exact method, URL, headers and body that would have gone out.

`create_block` is the one asymmetric case: it stops after recording the create call, because the
second step needs the block id that a real create would have returned.

## Not ported

These MCP tools have no command yet. They fail with "Unknown tool" rather than pretending:

- `create_site`, `list_site_templates`
- `duplicate_page`, `delete_page`
- `get_rendered_block_html` — the preview endpoint's authentication needs confirming against
  production before it can be relied on. This matters: it is the step that reveals the real CSS
  class names, so the CSS rung of the styling ladder in `site-builder-blocks` currently has to be
  driven from a live browser instead.
- `create_sidebar`
- SEO (`get_page_seo`, `update_page_seo`, `update_seo_favicon`)
- `update_feature_toggles`, `connect_integration`, `disconnect_integration`
- `update_localization` — reading translations works (`get_block_translations`); writing them does not
- AI blocks (`validate_ai_block_code`, `get_ai_block_source`, `create_ai_block`, `update_ai_block`, `delete_ai_block`)
- Store reads (`get_store_data`, `get_launcher_list`, `get_daily_reward`, `get_offer_chains`)
- The four `knowledge_*` tools — their content belongs in skill text, not in a command

## Federated blocks and `SB_BLOCKS_SERVICE_URL`

Four modules (`sb-offer-chain`, `sb-daily-reward`, `social-quests`, `offerwall-block`) are served
from a separate publication service rather than being built into Site Builder. Its host is not
committed to this repository, so those four are unavailable until `SB_BLOCKS_SERVICE_URL` is set.
Every other module works without it. `list_block_modules` marks them `catalog: "unavailable"`
when it is unset.
