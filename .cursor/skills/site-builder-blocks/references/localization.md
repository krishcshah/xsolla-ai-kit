# Translations

## Native and federated blocks work completely differently

Same user intent — "change the German title" — two unrelated mechanisms. Getting this wrong is the
most common way to write a translation that goes nowhere.

**Native blocks** do not use the localization service at all. The text lives on the block, as a
`LocalizedValueDescriptor`. You change it with `update_block`, patching the field:

```bash
node "$SB" update_block '{
  "merchantId":"…","projectId":"…","domain":"…","blockId":"…",
  "values": { "title": { "__type":"localized-value-descriptor","enable":true,"tag":"title",
              "quillWrapper":"h2",
              "localizedString": { "en-US":"Welcome","de-DE":"Willkommen" } } }
}'
```

**Localized fields are replaced, not merged.** The `localizedString` you pass replaces the whole
existing one, so any locale you omit is deleted. Read the current value with
`get_block_translations` and send it back with your change applied.

**Federated blocks** keep their text in the localization service, keyed through
`internalBlockValues.translations`. Changing it needs `update_localization`, which is **not ported
yet**. Reading works; writing has to happen in the editor for now.

## Reading: why it takes two requests

Neither endpoint has both halves.

| Endpoint | Has the text | Has the id |
| --- | --- | --- |
| `GET …/blocks/{id}` (hydrated) | yes, inlined | **no — stripped** |
| `GET …/structure/internal` (raw) | no, just a reference | yes |

`get_block_translations` fetches both in parallel and combines them: text from the hydrated block,
the real `localizationId` and the page scope from the raw one.

This is why **you cannot read `localizationId` from `get_block`** — that endpoint hydrates, so the
id is gone. If you find yourself with a short key like `title` or `k1` from
`internalBlockValues.translations`, that is a resource key, not a localization id. The real one
looks like `L:<uuid>`.

```bash
node "$SB" get_block_translations '{"merchantId":"…","projectId":"…","domain":"…","blockId":"…"}'
```

Optional: `locales` to narrow the output to specific languages, `filter` to keep only fields whose
path starts with a prefix.

## Scope

The response includes `pageId`. It is the scope the translation lives in:

- `pageId: "page-1"` — page scope
- `pageId: null` — common, site-level scope

When `update_localization` lands, that scope has to match. The write endpoint **upserts**, so a
wrong scope or a mistyped id returns `updated: true` while writing somewhere nothing reads. The
guard for that is already implemented (the id is checked against the target scope first, and the
call is refused with a pointer back here), but it is worth understanding why the check exists: a
successful-looking response is not proof the text changed.

## Locales

Five-character codes only. The 27 accepted values:

```
ar-AE  bg-BG  cs-CZ  de-DE  en-US  es-ES  fil-PH  fr-FR  he-IL  hu-HU
id-ID  it-IT  ja-JP  km-KH  ko-KR  my-MM  ne-NP  lo-LA  pl-PL  pt-BR
ro-RO  ru-RU  th-TH  tr-TR  vi-VN  zh-CN  zh-TW
```

`en-GB` is not one of them. Neither is `en`.
