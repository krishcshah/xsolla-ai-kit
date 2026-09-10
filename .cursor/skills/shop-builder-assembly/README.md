# Shop Builder assembly skill

Assembles an unpublished Shop Builder site in a sandbox or dedicated test project
from a normalized JSON shop brief.

## Prerequisites

- Xsolla CLI with `shopbuilder` commands
- `xsolla auth login` completed for a Publisher account
- Sandbox IDs or an explicitly acknowledged dedicated test project configured
- Existing catalog group IDs for any `newStore` sections
- A dedicated test project; never use a partner live project

## Happy path

1. Copy the closest file in `examples/` to `brief.json` and replace the project, game,
   site, and catalog values.
2. Validate the brief and verify the local CLI context:

   ```bash
   python3 scripts/validate_shop_brief.py brief.json
   python3 scripts/preflight.py brief.json
   python3 scripts/render_plan.py brief.json
   ```

3. Review the plan and explicitly confirm it before any Shop Builder write.
4. Back up an existing target before editing:

   ```bash
   python3 scripts/backup_shop.py --brief brief.json --slug my-shop --output-dir ./backups/my-shop
   ```

5. Follow the confirmed assembly sequence in `SKILL.md`; verify and preview, but do
   not publish.
6. For formal runs, append the result using `references/evaluation.md` and check the
   metrics with `scripts/summarize_evals.py`.

## Known limitations

- Formal reviewer approval of the standard block inventory and three presets is
  recorded during the PR phase; it is not required to begin implementation testing.
- Use `references/expert-review.md` to record the eventual review and its evidence.
- Test project IDs are intentionally not stored in committed examples.
- The CLI does not currently expose an authoritative list of standard block modules.
- Multi-command Shop Builder authentication, readiness verification, and CLI preview
  have confirmed defects captured in `references/test-findings.md`.
- Description, External Store, and Figma caller skills are tracked separately and are
  not yet present in this repository.
