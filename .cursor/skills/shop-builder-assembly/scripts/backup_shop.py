#!/usr/bin/env python3
"""Export read-only Shop Builder state before an assembly write."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from validate_shop_brief import load_brief, validate


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


def landing_id(structure: object) -> str:
    value = data(structure)
    if not isinstance(value, dict) or not isinstance(value.get("_id"), str):
        raise RuntimeError("get-structure did not return a landing _id")
    return value["_id"]


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--brief", required=True, type=Path)
    parser.add_argument("--slug", required=True)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()

    if shutil.which("xsolla") is None:
        print("xsolla CLI is not installed", file=sys.stderr)
        return 1
    if args.output_dir.exists():
        if not args.output_dir.is_dir() or any(args.output_dir.iterdir()):
            print("output directory must be absent or empty", file=sys.stderr)
            return 1

    try:
        brief = load_brief(args.brief)
        errors = validate(brief)
        if errors:
            raise RuntimeError("invalid shop brief: " + "; ".join(errors))
        expected = brief["project"]
        config = run_json("config", "list")
        config_data = data(config)
        if not isinstance(config_data, dict):
            raise RuntimeError("xsolla config list returned an unexpected shape")
        if config_data.get("merchant_id") != expected["merchant_id"]:
            raise RuntimeError("CLI merchant_id does not match the shop brief")
        if config_data.get("project_id") != expected["project_id"]:
            raise RuntimeError("CLI project_id does not match the shop brief")
        expected_sandbox = expected["environment"] == "sandbox"
        sandbox_enabled = config_data.get("sandbox") is True
        if sandbox_enabled != expected_sandbox:
            raise RuntimeError(
                "CLI sandbox setting does not match the shop brief environment"
            )

        websites = run_json("shopbuilder", "list-websites")
        landing = run_json("shopbuilder", "get-landing", "--slug", args.slug)
        structure = run_json("shopbuilder", "get-structure", "--slug", args.slug)
        localization = run_json("shopbuilder", "get-localization", "--slug", args.slug)
        assets = run_json("shopbuilder", "list-assets", "--landing-id", landing_id(structure))
        versions = run_json("shopbuilder", "list-versions", "--slug", args.slug)

        args.output_dir.mkdir(parents=True, exist_ok=True)
        write_json(args.output_dir / "config.json", config)
        write_json(args.output_dir / "websites.json", websites)
        write_json(args.output_dir / "landing.json", landing)
        write_json(args.output_dir / "structure.json", structure)
        write_json(args.output_dir / "localization.json", localization)
        write_json(args.output_dir / "assets.json", assets)
        write_json(args.output_dir / "versions.json", versions)
        files = [
            "config.json",
            "websites.json",
            "landing.json",
            "structure.json",
            "localization.json",
            "assets.json",
            "versions.json",
        ]
        write_json(
            args.output_dir / "manifest.json",
            {
                "slug": args.slug,
                "merchant_id": expected["merchant_id"],
                "project_id": expected["project_id"],
                "environment": expected["environment"],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "read_only": True,
                "files": files,
                "sha256": {
                    name: checksum(args.output_dir / name) for name in files
                },
            },
        )
    except (OSError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(args.output_dir.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
