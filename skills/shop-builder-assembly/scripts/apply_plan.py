#!/usr/bin/env python3
"""Apply a confirmed Shop Builder plan without publishing the landing."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

from render_plan import build_plan, canonical_hash
from validate_shop_brief import VERIFIED_BLOCK_MODULES, load_brief, validate

BACKUP_FILE_NAMES = {
    "config.json",
    "websites.json",
    "landing.json",
    "structure.json",
    "localization.json",
    "assets.json",
    "versions.json",
}


def run_json(*args: str) -> object:
    command = ["xsolla", *args, "--json"]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode:
        detail = result.stderr.strip() or result.stdout.strip()
        if "publisher session bootstrap" in detail:
            detail += (
                "; refresh the supported Publisher login with `xsolla auth login` "
                "and rerun—never copy a browser PA token"
            )
        raise RuntimeError(f"{' '.join(args)} failed: {detail}")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{' '.join(args)} returned invalid JSON") from exc


def data(value: object) -> object:
    if isinstance(value, dict) and value.get("ok") is True and "data" in value:
        return value["data"]
    return value


def website_exists(value: object, slug: str) -> bool:
    payload = data(value)
    if isinstance(payload, dict):
        payload = payload.get("items", payload.get("landings", payload))
    if isinstance(payload, list):
        return any(
            isinstance(item, dict)
            and (item.get("domain") == slug or item.get("slug") == slug)
            for item in payload
        )
    text = json.dumps(payload, sort_keys=True)
    return f'"{slug}"' in text


def structure(slug: str) -> dict:
    value = data(run_json("shopbuilder", "get-structure", "--slug", slug))
    if not isinstance(value, dict) or not isinstance(value.get("pages"), list):
        raise RuntimeError("get-structure returned an unexpected shape")
    return value


def page_for_path(value: dict, path: str) -> dict | None:
    for page in value["pages"]:
        if isinstance(page, dict) and page.get("path") == path:
            return page
    return None


def verified_backup(path: Path, expected: dict, slug: str) -> bool:
    manifest_path = path / "manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if (
            manifest.get("slug") != slug
            or manifest.get("merchant_id") != expected["merchant_id"]
            or manifest.get("project_id") != expected["project_id"]
            or manifest.get("environment") != expected["environment"]
            or manifest.get("read_only") is not True
        ):
            return False
        files = manifest.get("files")
        digests = manifest.get("sha256")
        if (
            not isinstance(files, list)
            or not files
            or any(
                not isinstance(name, str) or Path(name).name != name for name in files
            )
            or len(files) != len(set(files))
            or set(files) != BACKUP_FILE_NAMES
            or not isinstance(digests, dict)
            or set(files) != set(digests)
        ):
            return False
        for name in files:
            digest = digests[name]
            if not isinstance(digest, str):
                return False
            file_path = path / name
            if hashlib.sha256(file_path.read_bytes()).hexdigest() != digest:
                return False
        return True
    except (OSError, TypeError, json.JSONDecodeError):
        return False


def backup_structure(path: Path) -> object:
    try:
        return json.loads((path / "structure.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"cannot read backup structure: {exc}") from exc


def run_preflight(brief_path: Path, approved_test_projects: Path | None) -> None:
    command = [
        sys.executable,
        str(Path(__file__).with_name("preflight.py")),
        str(brief_path),
    ]
    if approved_test_projects is not None:
        command.extend(["--approved-test-projects", str(approved_test_projects)])
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        raise RuntimeError(
            result.stderr.strip() or result.stdout.strip() or "preflight failed"
        )


def reconcile_page(slug: str, landing_id: str, page_plan: dict) -> dict:
    current = structure(slug)
    page = page_for_path(current, page_plan["path"])
    if page is None:
        raise RuntimeError(
            f"page {page_plan['path']} must be created in the page phase before reconciliation"
        )
    if not isinstance(page.get("_id"), str):
        raise RuntimeError(f"could not resolve page {page_plan['path']}")

    page_id = page["_id"]
    desired = page_plan["blocks"]
    unverified = sorted(set(desired) - VERIFIED_BLOCK_MODULES)
    if unverified:
        raise RuntimeError(
            "plan contains unverified block modules: " + ", ".join(unverified)
        )
    kept: set[str] = set()
    removals: list[dict] = []
    blocks = page.get("blocks", [])
    if not isinstance(blocks, list) or any(
        not isinstance(block, dict) for block in blocks
    ):
        raise RuntimeError("pages[].blocks must contain full block objects")
    for block in blocks:
        module = block.get("module")
        if module in desired and module not in kept:
            kept.add(module)
        else:
            removals.append(block)
    approved_removals = {
        removal["block_id"]: removal["module"]
        for removal in page_plan.get("removals", [])
    }
    unapproved = [
        block
        for block in removals
        if approved_removals.get(block.get("_id")) != block.get("module")
    ]
    if unapproved:
        details = ", ".join(
            f"{block.get('module')}:{block.get('_id')}" for block in unapproved
        )
        raise RuntimeError(
            "current page requires unconfirmed block removals; back up, re-render, "
            f"and reconfirm the plan ({details})"
        )
    for block in removals:
        run_json(
            "shopbuilder",
            "delete-block",
            "--landing-id",
            landing_id,
            "--page-id",
            page_id,
            "--blockid",
            block["_id"],
            "--force",
        )

    page = page_for_path(structure(slug), page_plan["path"])
    if page is None:
        raise RuntimeError(
            f"page disappeared during reconciliation: {page_plan['path']}"
        )
    existing = [block.get("module") for block in page.get("blocks", [])]
    for module in desired:
        if module not in existing:
            run_json(
                "shopbuilder",
                "add-block",
                "--landing-id",
                landing_id,
                "--page-id",
                page_id,
                "--block",
                module,
            )
            existing.append(module)

    for destination, module in enumerate(desired):
        page = page_for_path(structure(slug), page_plan["path"])
        if page is None:
            raise RuntimeError(f"page disappeared during ordering: {page_plan['path']}")
        modules = [block.get("module") for block in page.get("blocks", [])]
        source = modules.index(module)
        if source != destination:
            run_json(
                "shopbuilder",
                "move-block",
                "--landing-id",
                landing_id,
                "--page-id",
                page_id,
                "--source",
                str(source),
                "--destination",
                str(destination),
            )

    final_page = page_for_path(structure(slug), page_plan["path"])
    if final_page is None:
        raise RuntimeError(f"could not read final page {page_plan['path']}")
    final_modules = [block.get("module") for block in final_page.get("blocks", [])]
    if final_modules != desired:
        raise RuntimeError(
            f"block reconciliation failed for {page_plan['path']}: {final_modules}"
        )
    return {
        "path": page_plan["path"],
        "page_id": page_id,
        "blocks": final_modules,
        "removed_blocks": len(removals),
    }


def add_missing_pages(slug: str, page_plans: list[dict]) -> list[str]:
    created: list[str] = []
    current = structure(slug)
    for page_plan in page_plans:
        if page_for_path(current, page_plan["path"]) is not None:
            continue
        run_json(
            "shopbuilder",
            "add-page",
            "--slug",
            slug,
            "--name",
            page_plan["name"],
            "--path",
            page_plan["path"],
        )
        created.append(page_plan["path"])
        current = structure(slug)
        if page_for_path(current, page_plan["path"]) is None:
            raise RuntimeError(f"could not resolve created page {page_plan['path']}")
    return created


def ensure_locales(slug: str, desired: list[str]) -> dict:
    current = structure(slug)
    languages = current.get("languages")
    if not isinstance(languages, list) or any(
        not isinstance(language, str) for language in languages
    ):
        raise RuntimeError("get-structure returned an invalid languages list")
    added: list[str] = []
    for locale in desired:
        if locale in languages:
            continue
        run_json("shopbuilder", "add-language", "--slug", slug, "--language", locale)
        added.append(locale)
        languages.append(locale)
    refreshed = structure(slug)
    final_languages = refreshed.get("languages")
    if not isinstance(final_languages, list) or any(
        locale not in final_languages for locale in desired
    ):
        raise RuntimeError("locale reconciliation did not produce every requested locale")
    return {
        "requested": desired,
        "added": added,
        "preserved_extra": sorted(set(final_languages) - set(desired)),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("brief", type=Path)
    parser.add_argument("--confirmation-id", required=True)
    parser.add_argument("--backup-dir", type=Path)
    parser.add_argument("--approved-test-projects", type=Path)
    args = parser.parse_args()
    try:
        brief = load_brief(args.brief)
        errors = validate(brief)
        if errors:
            raise RuntimeError("invalid shop brief: " + "; ".join(errors))
        run_preflight(args.brief, args.approved_test_projects)

        expected = brief["project"]
        config = data(run_json("config", "list"))
        if not isinstance(config, dict):
            raise RuntimeError("xsolla config list returned an unexpected shape")
        if config.get("merchant_id") != expected["merchant_id"]:
            raise RuntimeError("CLI merchant_id does not match the shop brief")
        if config.get("project_id") != expected["project_id"]:
            raise RuntimeError("CLI project_id does not match the shop brief")
        if (config.get("sandbox") is True) != (expected["environment"] == "sandbox"):
            raise RuntimeError("CLI sandbox setting does not match the shop brief")

        slug = brief["site"]["slug"]
        existed = website_exists(run_json("shopbuilder", "list-websites"), slug)
        if existed:
            if args.backup_dir is None:
                raise RuntimeError("--backup-dir is required for an existing target")
            if not verified_backup(args.backup_dir, expected, slug):
                raise RuntimeError(
                    "a complete verified backup created before confirmation is required"
                )
            saved_structure = backup_structure(args.backup_dir)
            plan = build_plan(brief, saved_structure)
        else:
            plan = build_plan(brief)

        if args.confirmation_id != plan["confirmation_id"]:
            raise RuntimeError("confirmation ID does not match the current plan")

        if existed:
            current = structure(slug)
            if canonical_hash(current) != plan["current_state"]["structure_sha256"]:
                raise RuntimeError(
                    "target structure changed after backup; back up, re-render, and reconfirm"
                )
            extra_pages = plan["current_state"]["extra_pages"]
            if extra_pages:
                paths = ", ".join(page["path"] for page in extra_pages)
                raise RuntimeError(
                    "target contains pages outside the confirmed plan and the CLI cannot "
                    f"delete pages safely: {paths}"
                )
        else:
            run_json(
                "shopbuilder",
                "create-website",
                "--name",
                brief["site"]["name"],
                "--slug",
                slug,
                "--type",
                "topup",
            )

        current = structure(slug)
        if current.get("type") is None:
            run_json(
                "shopbuilder", "set-landing-type", "--slug", slug, "--type", "store"
            )
            current = structure(slug)
        if current.get("type") != "store":
            raise RuntimeError(
                f"target landing type is {current.get('type')!r}, expected 'store'"
            )
        landing_id = current.get("_id")
        if not isinstance(landing_id, str):
            raise RuntimeError("landing has no _id")

        created_pages = add_missing_pages(slug, plan["pages"])
        locales = ensure_locales(slug, plan["locales"])
        if not existed:
            print(
                json.dumps(
                    {
                        "operation_succeeded": True,
                        "assembly_complete": False,
                        "status": "bootstrap-complete",
                        "confirmation_id": plan["confirmation_id"],
                        "slug": slug,
                        "landing_id": landing_id,
                        "created_pages": created_pages,
                        "locales": locales,
                        "next_action": (
                            "Back up the generated site, render a target-bound plan, "
                            "and explicitly confirm its exact removals before reconciliation."
                        ),
                        "published": False,
                    },
                    indent=2,
                )
            )
            return 0

        if created_pages:
            print(
                json.dumps(
                    {
                        "operation_succeeded": True,
                        "assembly_complete": False,
                        "status": "page-phase-complete",
                        "confirmation_id": plan["confirmation_id"],
                        "slug": slug,
                        "landing_id": landing_id,
                        "created_pages": created_pages,
                        "locales": locales,
                        "next_action": (
                            "Back up the changed site, re-render its generated block IDs, "
                            "and explicitly confirm before block reconciliation."
                        ),
                        "published": False,
                    },
                    indent=2,
                )
            )
            return 0

        pages = [reconcile_page(slug, landing_id, page) for page in plan["pages"]]
        print(
            json.dumps(
                {
                    "operation_succeeded": True,
                    "assembly_complete": not plan["unsupported_phases"],
                    "status": "implemented-phases-applied",
                    "confirmation_id": plan["confirmation_id"],
                    "slug": slug,
                    "landing_id": landing_id,
                    "site_existed": existed,
                    "pages": pages,
                    "locales": locales,
                    "completed_phases": plan["implemented_phases"],
                    "pending_phases": plan["unsupported_phases"],
                    "published": False,
                },
                indent=2,
            )
        )
        return 0
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"Apply failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
