from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

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
            structure = root / "structure.json"
            structure.write_bytes(b"{}\n")
            digest = hashlib.sha256(structure.read_bytes()).hexdigest()
            manifest = {
                "slug": "test-shop",
                **expected,
                "files": ["structure.json"],
                "sha256": {"structure.json": digest},
            }
            (root / "manifest.json").write_text(
                json.dumps(manifest), encoding="utf-8"
            )
            self.assertTrue(
                apply_plan.verified_backup(root, expected, "test-shop")
            )
            structure.write_bytes(b"changed\n")
            self.assertFalse(
                apply_plan.verified_backup(root, expected, "test-shop")
            )


if __name__ == "__main__":
    unittest.main()
