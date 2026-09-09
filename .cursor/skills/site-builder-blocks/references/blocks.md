# Block modules, versions and payload shape

Run `list_block_modules` for the live list — it reports `maxVersion` per module and marks the
federated ones. The table below is orientation, not the source of truth.

## Native modules

| Module | UI name | Version required |
| --- | --- | --- |
| `description` | Description | 2 |
| `faq` | FAQs | 2 |
| `footer` | Footer | 3 |
| `gallery` | Gallery | 2 |
| `html` | Custom code | 2 |
| `news` | News | 2 |
| `packs` | Game packs | 2 |
| `promocodes` | Promo codes | 2 |
| `requirements` | System requirements | 2 |
| `hero` | Call-to-action | none |
| `fast-login` | Fast Login | none |
| `lead`, `leadGameSales` | Lead block | none |
| `newStore` | Store | none |
| `nft` | NFT store | none |
| `promoSlider` | Promo slider | none |
| `retailers` | Sellers block | none |
| `rewards` | Reward system | none |
| `embed` | Social media widgets | none |
| `subscriptions-packs` | Subscriptions | none |
| `bento-grid` | Card grid | none |
| `payment-methods` | Payment methods | none |

"Version required: none" means the module has no versioning concept and `1` is always correct.
Everything else must be created at exactly the version `get_block_schema` reports — both a missing
version and an older one are rejected.

Cannot be created: `header`, `common-layout`, `side-by-side-layout` (site-level, automatic),
`sidebar` (needs the dedicated tool, not ported), `federated` (internal — name the real module
instead), `store` (deprecated, use `newStore`).

> This list is a snapshot taken from the platform's block metadata, because the package that
> defines it is not reachable from this repository. It goes stale quietly. If `create_block`
> rejects a module that `list_block_modules` offered, or accepts a version this table disagrees
> with, trust the API and flag the snapshot.

## `blockValues`

Nested, never flat:

```json
{ "values": { "title": …, "slides": … }, "components": [ … ] }
```

`{ "title": … }` at the top level is the most common malformed payload.

Field-level validation is not performed locally — the schemas live in a package this repository
cannot reach — so a malformed payload is rejected by the API rather than by the command. That
makes step 2 of the order (`get_block_schema`, or `get_block` on an existing block of the same
module) load-bearing rather than optional.

## Localized text: `LocalizedValueDescriptor`

Every user-visible string is an object, not a string:

```json
{
  "__type": "localized-value-descriptor",
  "enable": true,
  "tag": "field-name",
  "quillWrapper": "h2",
  "localizedString": { "en-US": "Plain text here" }
}
```

- Locale keys are five characters: `en-US`, `ru-RU`, `de-DE`, `zh-CN`. Never `en` or `ru`.
- `quillWrapper` carries the HTML tag; `localizedString` carries **plain text**. The server wraps
  it. Passing `"<h2>Title</h2>"` produces `<h2><h2>Title</h2></h2>`.
- Take the `quillWrapper` value from `get_block_schema` rather than choosing one.
- In an existing block these appear as `{ "id": "L:uuid", "enable": true }` — a reference, with the
  text held elsewhere. That is why editing translations goes through
  [localization.md](localization.md).

## Images

1. If the user gave URLs, use them.
2. Otherwise, if a game or theme is named, find real images (web search) before creating the block.
   A gallery of grey placeholders is worse than asking.
3. Placeholders only when there is nothing to go on.

For federated blocks an image URL is routed into a side-channel automatically — see
[federated.md](federated.md).

## Blocks that hold no content

These render data owned by other Xsolla services. Creating one sets up the display shell; the
content depends on configuration elsewhere. Always tell the user what is still needed.

| Module | Needs | Field |
| --- | --- | --- |
| `news` | A Launcher project for this `projectId` | `values.launcherId` — leave `""` if unknown |
| `newStore` / `store` | Store items in the Publisher Account | Components reference `storeItemsGroup` ids; leave empty so the user picks in the editor |
| `subscriptions-packs` | Subscription plans in the Publisher Account | `values.groupId` — leave `null` |
| `retailers` | An Airtable base | `values.databaseName`, `values.tableName` |
| `rewards` | An existing chain in the Rewards service | `values.rewardChainId` |
| `nft` | Store NFT groups | as `newStore` |

`newStore` also hydrates client-side, which matters when styling it — see [styling.md](styling.md).
