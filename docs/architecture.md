# Architecture

```
shop-setup (orchestrator)
    ├── merchant-setup                   → Merchant and Project setup
    ├── login-setup                      → Xsolla Login API
    ├── catalog-design                   → IGS API: /merchant/v2/projects/{id}/items/*
    ├── headless-checkout-integration    → Payments via Headless Checkout
    ├── webhooks-impl                    → Webhook configuration + handler code generation
    └── production                       → Sandbox → live (contract, flags, deploy, live tests)
```

Site Builder is a separate track — it edits an existing Site Builder site rather than building a shop:

```
site-builder-pages                       → sites, pages, themes (the ids everything else needs)
    └── site-builder-blocks              → the content inside a page: blocks, translations
```

Skills call Xsolla REST APIs directly. The CLI (`xsolla/xsolla-cli`) is an optional shortcut once it ships.

The `site-builder-*` skills are the exception to "no code in this repo": they invoke
`scripts/site-builder/sb.mjs`, a zero-dependency Node command, because their payload construction
is not something a skill can safely describe in prose — see
[site-builder-blocks/references/federated.md](../skills/site-builder-blocks/references/federated.md).
