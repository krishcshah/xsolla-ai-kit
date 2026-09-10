#!/usr/bin/env python3
"""Validate the stable, non-secret inputs for Shop Builder assembly."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PRESETS = {"auto", "mobile-single-page", "pc-multi-page", "live-service-events"}
PLATFORMS = {"mobile", "pc", "console", "web"}
LIFECYCLES = {"launch", "evergreen", "live-service"}
GROUP_TYPES = {"virtual_good", "bundle", "virtual_currency"}
SECRET_KEYS = {"api_key", "password", "session", "token", "cookie", "secret"}
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
LOCALE_RE = re.compile(r"^[a-z]{2}-[A-Z]{2}$")


def load_brief(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot read valid JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError("top-level value must be an object")
    return value


def validate(brief: dict) -> list[str]:
    errors: list[str] = []

    def obj(name: str) -> dict:
        value = brief.get(name)
        if not isinstance(value, dict):
            errors.append(f"{name} must be an object")
            return {}
        return value

    if brief.get("version") != 1:
        errors.append("version must be 1")

    def find_secrets(value: object, path: str = "") -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                child_path = f"{path}.{key}" if path else key
                if key.lower() in SECRET_KEYS:
                    errors.append(f"{child_path} must not contain credentials")
                find_secrets(child, child_path)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                find_secrets(child, f"{path}[{index}]")

    find_secrets(brief)
    project, game, site, catalog = obj("project"), obj("game"), obj("site"), obj("catalog")

    for field in ("merchant_id", "project_id"):
        if not isinstance(project.get(field), int) or project[field] <= 0:
            errors.append(f"project.{field} must be a positive integer")
    environment = project.get("environment")
    if environment not in {"sandbox", "test"}:
        errors.append("project.environment must be sandbox or test")
    if environment == "test" and project.get("test_project_acknowledged") is not True:
        errors.append(
            "project.test_project_acknowledged must be true for a dedicated test project"
        )

    if not isinstance(game.get("name"), str) or not game["name"].strip():
        errors.append("game.name is required")
    platforms = game.get("platforms")
    if not isinstance(platforms, list) or not platforms or not set(platforms) <= PLATFORMS:
        errors.append(f"game.platforms must use: {', '.join(sorted(PLATFORMS))}")
    if game.get("lifecycle") not in LIFECYCLES:
        errors.append(f"game.lifecycle must use: {', '.join(sorted(LIFECYCLES))}")

    if not isinstance(site.get("name"), str) or not site["name"].strip():
        errors.append("site.name is required")
    if not isinstance(site.get("slug"), str) or not SLUG_RE.fullmatch(site["slug"]):
        errors.append("site.slug must be lowercase kebab-case")
    if site.get("preset") not in PRESETS:
        errors.append(f"site.preset must use: {', '.join(sorted(PRESETS))}")
    locales = site.get("locales")
    if not isinstance(locales, list) or not locales or any(not isinstance(x, str) or not LOCALE_RE.fullmatch(x) for x in locales):
        errors.append("site.locales must be a non-empty list of full locale codes")
    if site.get("primary_locale") not in (locales or []):
        errors.append("site.primary_locale must be included in site.locales")

    groups = catalog.get("groups")
    if not isinstance(groups, list):
        errors.append("catalog.groups must be a list")
    else:
        seen: set[tuple[str, str]] = set()
        for index, group in enumerate(groups):
            if not isinstance(group, dict):
                errors.append(f"catalog.groups[{index}] must be an object")
                continue
            external_id = group.get("external_id")
            if not isinstance(external_id, str) or not external_id.strip():
                errors.append(f"catalog.groups[{index}].external_id is required")
            group_type = group.get("type")
            if group_type not in GROUP_TYPES:
                errors.append(f"catalog.groups[{index}].type must use: {', '.join(sorted(GROUP_TYPES))}")
            elif isinstance(external_id, str) and external_id.strip():
                identity = (group_type, external_id)
                if identity in seen:
                    errors.append(f"catalog.groups[{index}] duplicates the same type and external_id")
                else:
                    seen.add(identity)

    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("brief", type=Path)
    args = parser.parse_args()
    try:
        brief = load_brief(args.brief)
        errors = validate(brief)
    except ValueError as exc:
        errors = [str(exc)]
    if errors:
        print("Shop brief is invalid:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("Shop brief is valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
