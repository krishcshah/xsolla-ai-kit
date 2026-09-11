#!/usr/bin/env python3
"""Extract non-sensitive block contract evidence from a UI-created site export."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def load_object(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot read valid export JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError("export must be an object")
    return value


def unwrap_export(value: dict) -> dict:
    if value.get("ok") is True and "data" in value:
        value = value["data"]
    if not isinstance(value, dict):
        raise ValueError("export data must be an object")
    return value


def json_type(value: object) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, dict):
        return "object"
    if isinstance(value, list):
        return "array"
    if isinstance(value, str):
        return "string"
    if isinstance(value, (int, float)):
        return "number"
    raise ValueError(f"unsupported JSON value type: {type(value).__name__}")


def extract_contracts(value: dict, source_label: str) -> dict:
    landing = unwrap_export(value)
    blocks = landing.get("blocks")
    if not isinstance(blocks, list) or any(
        not isinstance(block, dict) for block in blocks
    ):
        raise ValueError("export blocks must be a list of objects")

    collected: dict[str, dict] = {}
    for block in blocks:
        module = block.get("module")
        values = block.get("values")
        components = block.get("components", [])
        if not isinstance(module, str) or not module:
            raise ValueError("every exported block must have a module name")
        if not isinstance(values, dict):
            raise ValueError(f"exported {module} block values must be an object")
        if not isinstance(components, list) or any(
            not isinstance(component, dict) for component in components
        ):
            raise ValueError(f"exported {module} components must be object arrays")

        contract = collected.setdefault(
            module,
            {
                "module": module,
                "observed_instances": 0,
                "block_versions": set(),
                "block_version_missing": False,
                "block_value_types": {},
                "component_item_fields": set(),
            },
        )
        contract["observed_instances"] += 1
        version = block.get("blockVersion")
        if isinstance(version, int) and not isinstance(version, bool):
            contract["block_versions"].add(version)
        else:
            contract["block_version_missing"] = True
        for key, field_value in values.items():
            if not isinstance(key, str):
                raise ValueError(f"exported {module} values contains a non-string key")
            field_types = contract["block_value_types"].setdefault(key, set())
            field_types.add(json_type(field_value))
        for component in components:
            contract["component_item_fields"].update(component)

    modules = []
    for module in sorted(collected):
        contract = collected[module]
        modules.append(
            {
                "module": module,
                "observed_instances": contract["observed_instances"],
                "block_versions": sorted(contract["block_versions"]),
                "block_version_missing": contract["block_version_missing"],
                "block_value_types": {
                    key: sorted(types)
                    for key, types in sorted(contract["block_value_types"].items())
                },
                "component_item_fields": sorted(contract["component_item_fields"]),
            }
        )

    cart = landing.get("cart")
    cart_types = None
    if isinstance(cart, dict):
        cart_types = {key: json_type(item) for key, item in sorted(cart.items())}

    return {
        "version": 1,
        "source": source_label,
        "landing_type": landing.get("type"),
        "modules": modules,
        "site_settings": {"cart": cart_types},
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("export", type=Path)
    parser.add_argument(
        "--source-label",
        default="redacted UI-created Site Builder export",
        help="Non-sensitive provenance label included in the output",
    )
    args = parser.parse_args()
    try:
        result = extract_contracts(load_object(args.export), args.source_label)
    except ValueError as exc:
        print(f"Contract extraction failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
