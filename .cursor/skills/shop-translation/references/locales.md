# Locale codes

The two surfaces disagree about what a locale looks like. This is the single most common cause of
a write that returns success and changes nothing visible.

| Surface | Format | Example | Written with |
| --- | --- | --- | --- |
| Catalog items | short | `ja`, `de`, `fr` | `catalog update-items --name/--description` |
| Catalog reads | short | `--locale ja` | `catalog list-catalog-items`, `get-item-by-sku` |
| Site Builder landing | five-char | `ja-JP`, `de-DE` | `shopbuilder add-language`, `update-many-localization` |

## Catalog

Confirmed working as map keys and as `--locale` values: `en`, `de`, `fr`, `ja`.

The set is wider than that, but treat anything outside the confirmed list as unverified — write it,
then read it back with `--locale <code>` before reporting the language as done. The CLI's own
`catalog-admin` skill (`xsolla skills show catalog-admin`) notes one rewrite to watch for: a
`pt-BR` key is stored under `pt`, so the key you send is not always the key that comes back.

`--locale` on a read never errors on an unknown code — it falls back to the default locale and
returns a 200. An unrecognized code and an untranslated item are indistinguishable in the response.

## Site Builder

Five-character codes only; `en` and `en-GB` are both invalid. The full accepted set of 27 is listed
in [../../site-builder-blocks/references/localization.md](../../site-builder-blocks/references/localization.md),
under *Locales* — that file is the source of truth, do not duplicate the list here.

`add-language` must run before the first write for a locale. Adding a language the landing already
has is harmless.

## Keeping the two in step

A shop translated into Japanese needs `ja` on every item *and* `ja-JP` on the landing. Nothing
enforces the pairing, and each half looks complete on its own:

- items `ja`, landing not added → Japanese item cards inside an English page
- landing `ja-JP`, items untouched → Japanese page furniture around English item cards

Check both before reporting a language as done.
