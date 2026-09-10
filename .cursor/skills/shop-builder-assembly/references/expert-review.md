# Shop Builder expert review checklist

Use this checklist in a 30-minute review with one SB Core or MIT engineer. Record the
review in the PR or linked Jira issue; do not mark draft evidence as approval.

## Block catalog

- Confirm the authoritative list of standard modules and whether `hero` and `lead`
  are separate modules, aliases, or version-specific names.
- For every module, confirm supported landing types, required data, safe patch paths,
  localization behavior, and catalog/auth dependencies.
- Identify deprecated, internal-only, or template-only modules.
- Confirm whether a CLI/API discovery operation exists. If none exists, approve filing
  the gap described in `references/cli-operations.md`.

## Presets

Review each preset independently:

| Preset | Questions | Reviewer | Date | Decision / evidence |
|---|---|---|---|---|
| `mobile-single-page` | Is the page/block order a sound mobile default? Is `newStore` the right store block? | TBD | TBD | Pending |
| `pc-multi-page` | Are Home, Store, and About the right default pages? Are requirements placed correctly? | TBD | TBD | Pending |
| `live-service-events` | Are Store and Events sufficiently separated? Are bundle/event defaults safe and reusable? | TBD | TBD | Pending |

For an approval, capture the reviewer's name, team, date, decision, and a durable link
to the PR comment, meeting notes, or Jira comment. Convert requested changes into the
preset or catalog before recording approval.

## Assembly behavior

- Confirm dependency order: theme, pages, navigation, blocks, copy/assets, catalog.
- Confirm that backup output is sufficient for recovery by a Shop Builder engineer.
- Confirm the verification checklist and which failures require manual intervention.
- Confirm that preview is safe and that publication remains a human-only action.
