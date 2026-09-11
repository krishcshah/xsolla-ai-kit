# Shop Builder assembly skill

Assembles an unpublished Shop Builder site in a sandbox or dedicated test project
from a normalized JSON shop brief.

## Prerequisites

- Xsolla CLI with `shopbuilder` commands
- `xsolla auth login` completed for a Publisher account
- Sandbox IDs or an explicitly acknowledged dedicated test project configured
- Existing catalog group IDs for any `newStore` sections
- A dedicated test project; never use a partner live project
- For a non-sandbox test project, a separate local approval allowlist containing the
  exact merchant/project identity and the mentor or lead's approval reference

## Happy path

1. Copy the closest file in `examples/` to `brief.json` and replace the project, game,
   site, and catalog values.
2. Validate the brief and verify the local CLI context:

   ```bash
   python3 scripts/validate_shop_brief.py brief.json
   python3 scripts/preflight.py brief.json \
     --approved-test-projects /path/to/approved-test-projects.json
   ```

3. If the target exists, back it up before rendering or confirming a plan:

   ```bash
   python3 scripts/backup_shop.py --brief brief.json --slug my-shop --output-dir ./backups/my-shop
   ```

4. Render the target-bound plan, review its exact block removals, and explicitly
   confirm its `confirmation_id`:

   ```bash
   python3 scripts/render_plan.py brief.json --structure ./backups/my-shop/structure.json
   python3 scripts/apply_plan.py brief.json --confirmation-id <id> \
     --backup-dir ./backups/my-shop \
     --approved-test-projects /path/to/approved-test-projects.json
   ```

   For a new slug, render without `--structure` and confirm the bootstrap-only plan.
   Bootstrap creates the landing and all requested page paths. Afterward, back up the
   generated templates and repeat this step with `--structure` before any template
   blocks are removed. An existing site that is missing requested page paths uses the
   same re-backup/reconfirmation boundary after those paths are created.

5. Follow the confirmed assembly sequence in `SKILL.md`; verify and preview, but do
   not publish. Export a fresh post-apply structure and compare it with the exact
   confirmed plan:

   ```bash
   python3 scripts/verify_structure.py \
     --plan ./artifacts/confirmed-plan.json \
     --structure ./artifacts/post-apply/structure.json
   ```
6. For formal runs, append the result using `references/evaluation.md` and check the
   metrics with `scripts/summarize_evals.py`.

## Known limitations

- Formal reviewer approval of the standard block inventory and three presets is
  recorded during the PR phase; it is not required to begin implementation testing.
- Use `references/expert-review.md` to record the eventual review and its evidence.
- Test project IDs are intentionally not stored in committed examples.
- A `test` brief is insufficient on its own: preflight and apply also require a
  separate, uncommitted allowlist record for the exact merchant/project IDs. Sandbox
  briefs do not require this file.
- The CLI does not currently expose an authoritative list of standard block modules.
- Multi-command Shop Builder authentication, readiness verification, and CLI preview
  have confirmed defects captured in `references/test-findings.md`.
- The CLI has no page-deletion command. Application stops before writes when an
  existing target contains pages outside the confirmed plan.
- The current apply script implements and reports page/block structure and requested
  locale addition. `verify_structure.py` checks target identity, page paths, block
  order, retained/removal IDs, locales, and unpublished state. The workflow never
  claims that theme, navigation, copy/assets, catalog links, verification, or preview
  completed; those phases remain blocked on authoritative patch contracts, acceptance
  decisions, or CLI fixes.
- Description, External Store, and Figma caller skills are tracked separately and are
  not yet present in this repository.
