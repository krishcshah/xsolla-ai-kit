# Standard block catalog

This catalog is deliberately marked **provisional** until an SB expert supplies or
approves the authoritative standard-module inventory. The current CLI exposes
`add-block --block <module>` but does not expose a command that lists all supported
standard module names. Do not claim 100% coverage from this file yet.

| Module | Purpose | Use when | Required data | Status |
|---|---|---|---|---|
| `header` | Site identity and navigation | Any multi-section or multi-page site | Logo/name, verified page targets | Verified in dedicated-project scaffold |
| `leadGameSales` | Hero and primary CTA | Every preset home page; event campaign page | Headline, CTA, image/background | Verified on dedicated test project |
| `hero` | Hero template name used by some API/CLI examples | Only after sandbox confirms whether it is distinct from `lead` | Headline, CTA, image/background | Name conflict; verification required |
| `description` | Long-form game or offer explanation | Context improves purchase confidence | Approved HTML copy | Verified in dedicated-project scaffold |
| `packs` | Present purchasable packs | A template already uses packs and its data shape is verified | Pack/catalog references, copy | Verified in dedicated-project scaffold |
| `bento-grid` | Modular feature highlights | Three or more scannable benefits/features | Cards, headings, images | Verified on dedicated test project |
| `gallery` | Screenshots or promotional media | PC portal, event, or visually rich game | Images and alt text | Verified in dedicated-project scaffold |
| `requirements` | Platform/system requirements | PC or console information page | Verified requirements by platform | Verified in dedicated-project scaffold |
| `faq` | Purchase and account questions | Supportable answers exist | Approved question/answer pairs | Verified in dedicated-project scaffold |
| `footer` | Legal/support/secondary links | Any complete site | Link labels and verified URLs | Verified in dedicated-project scaffold |
| `federated` | Federated/login-oriented UI | Existing template and auth flow require it | Verified Login configuration | Seen in CLI docs; shape TBD |
| `newStore` | Catalog grid and sections | The site sells project catalog content | Same-project group IDs and localized titles | Verified with `add-block` on dedicated test project |

Before adding any module, confirm its exact name and returned data shape on an
approved blank sandbox or dedicated test project. Capture newly verified fields here: purpose,
decision rule, required data, incompatible landing types, localization IDs, and safe
patch paths. File a CLI gap if no authoritative module-discovery operation exists.
