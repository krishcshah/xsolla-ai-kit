# Standard block catalog

Authoritative product inventory: [Xsolla Web Shop — Blocks](https://developers.xsolla.com/solutions/web-shop/create-web-shop/blocks/),
last updated June 25, 2026. This catalog documents all 24 entries on that page.
Template names come from the current Site Builder **Add block** palette; safe field
shapes come only from a redacted export of a UI-created site. See
[exported-block-contracts.md](exported-block-contracts.md).

Status meanings:

- **Exported** — template name and field shape were observed in a UI-created export.
- **Palette** — current template name was observed, but its field shape still needs an
  exported instance before automated value patches are allowed.
- **Setting** — the documented feature is stored at site level, not as a page block.
- **Gap** — the official entry is not available in the current palette/export; file and
  link a Shop Builder/CLI gap before trying to substitute another module.

Coverage: **24/24 official entries documented (100%)**. Mapping coverage is **23/24**;
Subscriptions remains a gap. Catalog and preset recommendations still require the
designated reviewer to approve them.

## Official inventory mapping

| Official block | Template/module | Purpose and when to use | Required publisher data | Status |
|---|---|---|---|---|
| Header | `header` | Site identity, authentication, language selection, and primary navigation; use on every complete page. | Logo or game name; verified page, purchase, and external targets; enabled auth/locales. | Exported |
| Sidebar | `sidebar` | Desktop side navigation that becomes a mobile bottom bar; use for navigation-heavy or mobile-first shops. | Page targets, app-store/social URLs, logo, and optional icons. | Palette |
| Lead — Single game page | `leadGameSales` | Introduce a sold game and its primary action; use on game-sales landing pages. | Title, developer, platforms, tags, CTA action, and hero media. | Exported |
| Lead — Web Shop | `leadGameSales` | Introduce the shop and game; use on Web Shop home pages. The same template name is exposed on the approved `store` landing. | Game icon, title, developer, feature-card copy/icons, and optional background media. | Exported |
| Call-to-action | `hero` | Focus attention on purchase, subscription, app-store, link, scroll, or video actions. | CTA label/action/target and optional email field, platform links, image, or video URL. | Palette |
| Fast Login | `fast-login` | Put required authentication directly before shopping; use when the project has a supported login method. | Configured auth method, button copy, title/description, user-ID help, and optional background. | Palette |
| Gallery | `gallery` | Show screenshots and videos; use when approved media improves game discovery. | Media URLs, alt text, optional title/description, and video URLs. | Exported |
| News | `news` | Publish articles, announcements, and changelogs; use for an actively maintained portal. | Published articles, categories, titles, dates, excerpts, and 16:9 images. | Palette |
| Cards | `bento-grid` | Display flexible game/shop feature cards; use for three or more scannable benefits. | Card copy, images, actions, layout, and alignment. | Exported |
| Promo slider | `promoSlider` | Rotate promotional banners and actions; use for several current campaigns or featured offers. | Slides with image, title, description, action target, and optional platform/email links. | Palette |
| Description | `description` | Explain the game or offer with text and images; use when context improves purchase confidence. | Approved localized copy, images, links, and horizontal/vertical layout. | Exported |
| Promo codes | `promocodes` | Let users apply promo codes or coupons; use only when matching project promotions exist. | Configured promo/coupon campaign, instructions, labels, and optional reviewed JS. | Palette |
| Game editions | `packs` | Compare game editions or packs and their benefits; use when selling multiple editions. The UI labels this template **Game packs**. | Edition SKUs, names, benefits, prices/actions, images, and recommended-edition choice. | Exported |
| Store | `newStore` | Sell keys, virtual items, bundles, and currency packages in catalog sections. | Same-project group IDs and types, localized section titles, card layouts, and login behavior. | Exported |
| Reward system | `rewards` | Display a configured reward chain and value points; use for an active loyalty program. | Reward-chain identifier/configuration, labels, and optional reviewed custom content. | Palette |
| Offer chain | `sb-offer-chain` | Display sequential free or paid offers; use when an active offer chain exists. | Offer-chain identifier, availability rules, item media, and authenticated purchase/claim setup. | Palette |
| Social media widgets | `embed` | Embed supported social channels; use when community content is actively maintained. | Supported service, page/channel URL or widget configuration, display type, and theme. | Palette |
| FAQs | `faq` | Answer common purchase, delivery, account, and support questions. | Approved localized question/answer pairs and optional reviewed JS. | Exported |
| Custom code | `html` | Add functionality unavailable in standard blocks; use only after security and maintainability review. | Reviewed HTML, CSS, and JS for all locales. | Palette |
| Cart settings | `site.cart` | Configure the site-wide shopping cart; it is not an addable page block. | Enable flag, promo-code-field choice, and login-before-cart choice. | Setting |
| System requirements | `requirements` | Show minimum and recommended platform requirements; use for PC/console products. | Verified requirements grouped by platform and display mode. | Exported |
| Subscriptions | `unmapped` | Sell or explain recurring service packages; use only when subscription products and plans exist. | Product/plan IDs, conditions, feature icons, plan image, and purchase behavior. | Gap |
| Social quests | `social-quests` | Reward social tasks with loyalty points; use only with configured quests and loyalty checkout. | Quest configuration, reward values, supported social actions, and authentication. | Palette |
| Footer | `footer` | Provide legal, privacy, language, social, and secondary navigation at page end. | Legal/privacy links, support/social links, locales, logo, and age restrictions. | Exported |

## Current palette entries absent from the official inventory page

Do not silently classify these as official standard blocks. Their template names were
observed in the current palette, but they need product documentation and exported
contracts before presets may use them.

| Palette label | Template/module | Gap |
|---|---|---|
| Payment methods | `payment-methods` | Not listed on the authoritative Blocks page. |
| NFT store | `nft` | Not listed on the authoritative Blocks page. |
| Offerwall | `offerwall-block` | Not listed on the authoritative Blocks page. |
| Daily rewards | `sb-daily-reward` | Not listed on the authoritative Blocks page. |
| Single Offer Block | `single-offer-block` | Not listed on the authoritative Blocks page. |

The older CLI guidance names `lead` and `federated`; neither appears in the current
palette, which exposes `leadGameSales` and `fast-login`. Treat the older names as a
version/documentation gap, not as aliases, until an export proves otherwise.

## Safe use rule

Adding a default block requires an observed current palette name. Patching its values
requires an exported contract. If a requested block is **Palette** or **Gap**, preserve
an existing configured instance, or omit it and report the missing export. Never infer
patch paths from the marketing name alone.
