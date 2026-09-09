# Payload shapes and known walls

## The localization store

`shopbuilder get-localization --slug <slug> -o json` returns two scopes:

```
data.common["L:<uuid>"].translations["en-US"]              # site-level strings
data.pages["<pageId>"].texts["L:<uuid>"].translations[...] # page-level strings
```

`get-structure` gives you the blocks; the text is not in them. A block field looks like
`{"enable": true, "id": "L:<uuid>"}` — the `id` is the lookup key into the store above. Walk every
page's blocks recursively for objects carrying an `id` that starts with `L:`.

The scope a string lives in is part of its address. A page string written under `common`, or under
the wrong `pageId`, is written somewhere nothing reads — and the call still returns success.

## Batch write

```bash
xsolla shopbuilder update-many-localization --slug <slug> --data '{
  "locale": "ja-JP",
  "perScopeValues": {
    "<pageId>": { "L:<uuid>": { "translation": "<h4>公式ストア</h4>" } },
    "common":   { "L:<uuid>": { "translation": "<p>フッター</p>" } }
  }
}'
```

**The per-id value must be the object `{"translation": "..."}`.** A bare string, or any other key
(`value`, `text`, `translations`), returns HTTP 200 and writes an **empty string** for that locale.
That is destructive and silent. One call can span many ids across many scopes. Locales other than
the one named are preserved.

Verify with a second `get-localization` and compare per string against what you sent.

## Catalog write

`update-items` takes the whole item, not a patch. Confirmed required: `--sku` (matching
`--item-sku`), `--name`, `--description`. Confirmed rejections:

| Body | Response |
| --- | --- |
| no `description` | 422 `The property description is required` |
| `description` `{"en":"","ja":""}` | 422 `Must be at least 1 characters long` for each locale |

Read the item with `get-item-by-sku` before writing and carry `--prices`, `--groups`,
`--image-url`, `--is-enabled`, `--is-show-in-store` through, so a translation pass cannot quietly
drop pricing or store visibility.

Note that `get-item-by-sku` returns the *resolved* view for one locale, not the raw locale map — it
shows `"name": "Emberforge Blade"`, not `{"en": ...}`. To see the map, read the same SKU once per
locale and assemble it.

## Project `locale_list`

A project record carries `locale_list`, and it is **not required** for either surface: items resolve
a locale from their own map and the landing serves from its own language list, both verified with
`locale_list: ["en"]`. Do not treat it as a prerequisite or a fix for a shop that renders in English.

It is also not reachable from the CLI. `merchant update-projects` requires `name`, the API demands
an object (`NameModel`), and the `--name` flag only emits a string — so the command cannot be
satisfied. Going at `PUT /merchant/current/projects/{id}` or `.../internal` directly hits a pair of
mutually exclusive validations:

| Body | Response |
| --- | --- |
| omit `integration_type` | 422 `Serverless integration is available only for projects with tokenless integration` |
| `integration_type: "standard"` | 422 `project-settings.advanced.project-url.error` |

The second fires regardless of the `url` value, with or without `return_url`. Send users to
Publisher Account → Project → Settings for this field.

One hazard if anyone retries it: that endpoint is **non-atomic**. A request rejected with 422 can
still have persisted part of the body — a `name` update landed from a call that failed overall. Do
not assume a 422 means nothing changed; re-read and diff.
