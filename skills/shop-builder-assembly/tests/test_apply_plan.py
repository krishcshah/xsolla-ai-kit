from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))


def load_apply_plan():
    path = ROOT / "scripts" / "apply_plan.py"
    spec = importlib.util.spec_from_file_location("apply_plan_for_tests", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


apply_plan = load_apply_plan()


def load_verify_structure():
    path = ROOT / "scripts" / "verify_structure.py"
    spec = importlib.util.spec_from_file_location("verify_structure_for_tests", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


verify_structure = load_verify_structure()


class ApplyPlanTests(unittest.TestCase):
    def test_website_exists_handles_wrapped_lists(self) -> None:
        response = {
            "ok": True,
            "data": {"items": [{"domain": "one-shop"}, {"slug": "two-shop"}]},
        }
        self.assertTrue(apply_plan.website_exists(response, "two-shop"))
        self.assertFalse(apply_plan.website_exists(response, "missing-shop"))

    def test_page_for_path_finds_only_exact_path(self) -> None:
        structure = {"pages": [{"path": "/", "_id": "home"}]}
        self.assertEqual("home", apply_plan.page_for_path(structure, "/")["_id"])
        self.assertIsNone(apply_plan.page_for_path(structure, "/store"))

    def test_verified_backup_requires_identity_and_matching_checksums(self) -> None:
        expected = {
            "merchant_id": 100,
            "project_id": 200,
            "environment": "test",
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in apply_plan.BACKUP_FILE_NAMES:
                (root / name).write_bytes(b"{}\n")
            structure = root / "structure.json"
            manifest = {
                "slug": "test-shop",
                **expected,
                "read_only": True,
                "files": sorted(apply_plan.BACKUP_FILE_NAMES),
                "sha256": {
                    name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                    for name in apply_plan.BACKUP_FILE_NAMES
                },
            }
            (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            self.assertTrue(apply_plan.verified_backup(root, expected, "test-shop"))
            structure.write_bytes(b"changed\n")
            self.assertFalse(apply_plan.verified_backup(root, expected, "test-shop"))

    def test_verified_backup_rejects_partial_digest_manifest(self) -> None:
        expected = {"merchant_id": 100, "project_id": 200, "environment": "test"}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("structure.json", "landing.json"):
                (root / name).write_bytes(b"{}\n")
            manifest = {
                "slug": "test-shop",
                **expected,
                "read_only": True,
                "files": sorted(apply_plan.BACKUP_FILE_NAMES),
                "sha256": {
                    "structure.json": hashlib.sha256(
                        (root / "structure.json").read_bytes()
                    ).hexdigest()
                },
            }
            (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            self.assertFalse(apply_plan.verified_backup(root, expected, "test-shop"))

    def test_real_cli_shape_keeps_full_blocks_on_pages(self) -> None:
        structure = {
            "_id": "landing",
            "blocks": ["site-block-id"],
            "pages": [
                {
                    "_id": "home",
                    "path": "/",
                    "blocks": [{"_id": "block-1", "module": "header"}],
                }
            ],
        }
        page = apply_plan.page_for_path(structure, "/")
        self.assertEqual("header", page["blocks"][0]["module"])

    def test_reconciliation_refuses_unconfirmed_removal_before_write(self) -> None:
        current = {
            "_id": "landing",
            "pages": [
                {
                    "_id": "home",
                    "path": "/",
                    "blocks": [
                        {"_id": "header-id", "module": "header"},
                        {"_id": "custom-id", "module": "gallery"},
                    ],
                }
            ],
        }
        plan = {
            "name": "Home",
            "path": "/",
            "blocks": ["header"],
            "removals": [],
        }
        with (
            mock.patch.object(apply_plan, "structure", return_value=current),
            mock.patch.object(apply_plan, "run_json") as run_json,
        ):
            with self.assertRaisesRegex(RuntimeError, "unconfirmed block removals"):
                apply_plan.reconcile_page("shop", "landing", plan)
            run_json.assert_not_called()

    def test_run_preflight_propagates_failure(self) -> None:
        failed = mock.Mock(
            returncode=1, stderr="Preflight failed: wrong project", stdout=""
        )
        with mock.patch.object(apply_plan.subprocess, "run", return_value=failed):
            with self.assertRaisesRegex(RuntimeError, "wrong project"):
                apply_plan.run_preflight(Path("brief.json"), None)

    def test_ensure_locales_adds_only_missing_languages(self) -> None:
        before = {"languages": ["en-US"]}
        after = {"languages": ["en-US", "de-DE"]}
        with (
            mock.patch.object(apply_plan, "structure", side_effect=[before, after]),
            mock.patch.object(apply_plan, "run_json") as run_json,
        ):
            result = apply_plan.ensure_locales("shop", ["en-US", "de-DE"])
        run_json.assert_called_once_with(
            "shopbuilder", "add-language", "--slug", "shop", "--language", "de-DE"
        )
        self.assertEqual(["de-DE"], result["added"])

    def test_structure_verifier_accepts_matching_unpublished_site(self) -> None:
        plan = {
            "confirmation_id": "sha256:test",
            "target": {"merchant_id": 100, "project_id": 200, "slug": "shop"},
            "locales": ["en-US"],
            "pages": [
                {
                    "path": "/",
                    "blocks": ["header", "footer"],
                    "preserved_blocks": [],
                    "removals": [],
                }
            ],
        }
        structure = {
            "ok": True,
            "data": {
                "merchantId": "100",
                "projectId": "200",
                "domain": "shop",
                "type": "store",
                "published": None,
                "languages": ["en-US"],
                "pages": [
                    {
                        "path": "/",
                        "blocks": [
                            {"_id": "header", "module": "header"},
                            {"_id": "footer", "module": "footer"},
                        ],
                    }
                ],
            },
        }
        result = verify_structure.verify(plan, structure)
        self.assertTrue(result["ok"])
        self.assertFalse(result["published"])

    def test_structure_verifier_reports_order_and_publication(self) -> None:
        plan = {
            "target": {"merchant_id": 100, "project_id": 200, "slug": "shop"},
            "locales": ["en-US"],
            "pages": [{"path": "/", "blocks": ["header", "footer"]}],
        }
        structure = {
            "merchantId": 100,
            "projectId": 200,
            "domain": "shop",
            "type": "store",
            "published": 1,
            "languages": ["en-US"],
            "pages": [
                {
                    "path": "/",
                    "blocks": [
                        {"_id": "footer", "module": "footer"},
                        {"_id": "header", "module": "header"},
                    ],
                }
            ],
        }
        result = verify_structure.verify(plan, structure)
        self.assertFalse(result["ok"])
        self.assertTrue(result["published"])
        self.assertTrue(
            any("block order differs" in error for error in result["errors"])
        )


if __name__ == "__main__":
    unittest.main()
