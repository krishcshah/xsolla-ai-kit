# Exported block contracts

These are sanitized structural observations from the approved SB-8796 test project's
UI-created `store` export on September 10, 2026. No IDs, localized copy, account data,
or asset URLs are retained. Regenerate this summary with:

```bash
python3 scripts/extract_block_contracts.py <ui-export.json> \
  --source-label "approved test project; UI-created export; YYYY-MM-DD"
```

`blockValues` below means the exported block's top-level `values` object. It is an
observed shape, not permission to replace the entire object. Use narrow Immer patches;
localized `L:` content must be updated through localization commands.

| Module | Version | Observed instances | `blockValues` fields (`name:type`) | `components[]` item fields |
|---|---:|---:|---|---|
| `header` | 3 | 1 | `background:object`, `components:object`, `fixedComponents:array`, `fixedWidth:boolean`, `headerFixed:object`, `isOverlap:boolean`, `leftComponents:array`, `rightComponents:array`, `script:object` | — |
| `leadGameSales` | field absent | 1 | `align:string`, `background:object`, `buttons:array`, `enable:boolean`, `platforms:object`, `script:object`, `subtitle:object`, `tags:object`, `title:object` | — |
| `description` | 2 | 1 | `align:string`, `background:object`, `components:object`, `componentsIds:array`, `hideFullDescription:boolean`, `readMoreButton:object`, `showLessButton:object`, `template:string`, `title:object` | — |
| `packs` | 2 | 3 | `background:object`, `bigClickArea:boolean`, `description:object`, `horizontalScroll:boolean`, `layout:string`, `packs:array`, `title:object` | — |
| `bento-grid` | field absent | 3 | `background:object`, `description:object`, `grid:object`, `gridComponents:object`, `sliderOnMobile:boolean`, `title:object` | — |
| `gallery` | 2 | 1 | `background:object`, `description:object`, `duplicateArrows:boolean`, `sliderLoop:boolean`, `slides:array`, `slidesPreview:boolean`, `title:object` | — |
| `requirements` | 2 | 1 | `background:object`, `layout:string`, `title:object` | `_id`, `enable`, `type`, `value` |
| `faq` | 2 | 1 | `background:object`, `enable:boolean`, `questionMode:boolean`, `script:object`, `template:string`, `title:object` | `_id`, `answer`, `enable`, `question`, `type`, `value` |
| `footer` | 2 | 1 | `background:object`, `description:object`, `layout:string`, `logo:object`, `script:object` | `_id`, `enable`, `type`, `value` |
| `newStore` | field absent | 1 | `alignment:string`, `background:object`, `description:object`, `enable:boolean`, `loginButton:object`, `script:object`, `tabs:object`, `title:object` | `_id`, `card`, `enable`, `section`, `type` |

The site-level `cart` object contains `enable:boolean`, `isRequiredAuth:boolean`, and
`showPromocodeField:boolean`. Page and site theme source fields are documented in
[cli-operations.md](cli-operations.md); computed theme fields are not patch inputs.

## Required follow-up exports

Export one UI-created instance of each palette-only module before automating its value
patches: `sidebar`, `hero`, `fast-login`, `news`, `promoSlider`, `promocodes`, `rewards`,
`sb-offer-chain`, `embed`, `html`, and `social-quests`. Also resolve the missing
Subscriptions module and the five palette-only documentation gaps in
[block-catalog.md](block-catalog.md).
