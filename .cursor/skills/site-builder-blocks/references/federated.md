# Federated blocks

Four modules are not built into Site Builder. They are published separately and loaded at render
time from a CDN bundle:

- `sb-offer-chain`
- `sb-daily-reward`
- `social-quests`
- `offerwall-block`

They need `SB_BLOCKS_SERVICE_URL` pointing at the publication service. Without it,
`list_block_modules` marks them `catalog: "unavailable"` and creating one fails with that
explanation. Every native module works without it.

Note the publication service catalog lists hundreds of blocks, including many `_site-builder-classic_*`
ids. Only the four above can be created as federated blocks — anything else must be a native module
by name. Asking for a catalog id that is not one of the four is rejected as an unknown module.

## What the command builds for you

A federated block is not stored under its own name. On the wire it becomes:

```jsonc
{
  "block": "federated",        // not the module you asked for
  "version": 1,                // forced, whatever you passed
  "blockValues": {
    "values": {
      "resources": { … },              // from the block's default-data.json
      "internalBlockValues": { … },    // its defaults, with your values merged in
      "host": "https://cdn…/<module>/<version>/",
      "blockId": "sb-daily-reward",    // the module name lives HERE
      "version": "1.2.3",
      "useAsNativeBlock": true
    },
    "devName": "…",
    "icon": "…"
  }
}
```

You pass your fields as `blockValues.values.internalBlockValues` and the rest is assembled from the
block's published defaults.

The consequence for reading: a stored federated block reports `module: "federated"`. Its real module
is in `values.blockId`. `get_block`, `search_blocks` and `update_block` all resolve that for you and
report the real module — but if you inspect raw API output yourself, expect `"federated"`.

## Images: the part you cannot guess

Any field whose default value is an image id (`I:abc123`) takes an **image id**, not a URL.

Pass an `http(s)` URL anyway and the command does the right thing: the URL is written to
`resources.mediaValues[<that id>].src`, and the field keeps the image id unchanged. The image
travels in a different branch of the payload from the field that references it.

```jsonc
// you write
{ "values": { "internalBlockValues": { "hero": "https://cdn.example/hero.png" } } }

// what is sent
{ "internalBlockValues": { "hero": "I:t22j2om3v9t" },
  "resources": { "mediaValues": { "I:t22j2om3v9t": { "src": "https://cdn.example/hero.png", … } } } }
```

**Why this matters even though it is handled:** if you ever build this payload by hand — through the
batch API, or a script of your own — writing the URL onto the field produces a request the API
happily accepts and that renders nothing at all. No error, no warning, just an empty image. If a
user reports "I set the image and nothing showed up", this is the first thing to check.

Run `get_block_schema` on a federated module to see which fields are image ids: it lists
`mediaValueIds` and returns the full `defaultData` tree.

## Cost

Creating one costs, before anything is written: the catalog, the block's `default-data.json`, the
create call, the site structure, and the placement patch — five requests across three hosts. The
catalog and defaults are cached for the run, so a batch of blocks pays it once.
