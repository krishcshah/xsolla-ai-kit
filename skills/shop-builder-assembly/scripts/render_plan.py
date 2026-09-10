#!/usr/bin/env python3
"""Render a deterministic, non-mutating assembly plan from a shop brief."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from validate_shop_brief import load_brief, validate

PRESET_PAGES = {
    "mobile-single-page": [
        {"name": "Home", "path": "/", "blocks": ["header", "leadGameSales", "newStore", "faq", "footer"]}
    ],
    "pc-multi-page": [
        {"name": "Home", "path": "/", "blocks": ["header", "leadGameSales", "description", "gallery", "footer"]},
        {"name": "Store", "path": "/store", "blocks": ["header", "newStore", "faq", "footer"]},
        {"name": "About", "path": "/about", "blocks": ["header", "description", "requirements", "faq", "footer"]},
    ],
    "live-service-events": [
        {"name": "Home", "path": "/", "blocks": ["header", "leadGameSales", "newStore", "gallery", "faq", "footer"]},
        {"name": "Store", "path": "/store", "blocks": ["header", "newStore", "faq", "footer"]},
        {"name": "Events", "path": "/events", "blocks": ["header", "leadGameSales", "newStore", "description", "footer"]},
    ],
}


def choose_preset(brief: dict) -> str:
    requested = brief["site"]["preset"]
    if requested != "auto":
        return requested
    game = brief["game"]
    if game["lifecycle"] == "live-service" or brief.get("content", {}).get("events"):
        return "live-service-events"
    if set(game["platforms"]) & {"pc", "console"}:
        return "pc-multi-page"
    return "mobile-single-page"


def build_plan(brief: dict) -> dict:
    preset = choose_preset(brief)
    catalog_groups = brief["catalog"]["groups"]
    warnings = []
    if not catalog_groups:
        warnings.append("No catalog groups supplied; newStore blocks cannot be wired.")
    brand = brief.get("brand", {})
    if not brand.get("logo"):
        warnings.append("No logo supplied; keep the template text identity until approved.")
    if preset == "live-service-events" and not brief.get("content", {}).get("events"):
        warnings.append("No event data supplied; omit event-specific copy and scarcity claims.")
    plan = {
        "version": 1,
        "target": {
            "merchant_id": brief["project"]["merchant_id"],
            "project_id": brief["project"]["project_id"],
            "environment": brief["project"]["environment"],
            "test_project_acknowledged": brief["project"].get(
                "test_project_acknowledged", False
            ),
            "site_name": brief["site"]["name"],
            "slug": brief["site"]["slug"],
        },
        "preset": preset,
        "requires_confirmation": True,
        "publication": "forbidden",
        "order": ["backup", "theme", "pages", "navigation", "blocks", "copy_assets", "catalog_links", "verify", "preview"],
        "pages": PRESET_PAGES[preset],
        "locales": brief["site"]["locales"],
        "catalog_sections": catalog_groups,
        "warnings": warnings,
    }
    canonical = json.dumps(plan, sort_keys=True, separators=(",", ":")).encode("utf-8")
    plan["confirmation_id"] = "sha256:" + hashlib.sha256(canonical).hexdigest()[:12]
    return plan


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("brief", type=Path)
    args = parser.parse_args()
    try:
        brief = load_brief(args.brief)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    errors = validate(brief)
    if errors:
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print(json.dumps(build_plan(brief), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
