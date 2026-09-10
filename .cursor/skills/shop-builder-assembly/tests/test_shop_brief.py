from __future__ import annotations

import copy
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


validator = load_module("validate_shop_brief", ROOT / "scripts" / "validate_shop_brief.py")
render_plan = load_module("render_plan", ROOT / "scripts" / "render_plan.py")
preflight = load_module("preflight", ROOT / "scripts" / "preflight.py")
backup_shop = load_module("backup_shop", ROOT / "scripts" / "backup_shop.py")
summarize_evals = load_module("summarize_evals", ROOT / "scripts" / "summarize_evals.py")


class ShopBriefTests(unittest.TestCase):
    def setUp(self) -> None:
        self.brief = json.loads(
            (ROOT / "examples" / "mobile-single-page.json").read_text(encoding="utf-8")
        )

    def test_example_is_valid_and_selects_mobile(self) -> None:
        self.assertEqual([], validator.validate(self.brief))
        self.assertEqual("mobile-single-page", render_plan.choose_preset(self.brief))

    def test_every_example_is_valid_and_selects_its_named_preset(self) -> None:
        expected = {
            "mobile-single-page.json": "mobile-single-page",
            "pc-multi-page.json": "pc-multi-page",
            "live-service-events.json": "live-service-events",
        }
        for filename, preset in expected.items():
            with self.subTest(filename=filename):
                brief = json.loads(
                    (ROOT / "examples" / filename).read_text(encoding="utf-8")
                )
                self.assertEqual([], validator.validate(brief))
                self.assertEqual(preset, render_plan.choose_preset(brief))

    def test_live_service_takes_priority(self) -> None:
        brief = copy.deepcopy(self.brief)
        brief["game"]["platforms"] = ["pc"]
        brief["game"]["lifecycle"] = "live-service"
        self.assertEqual("live-service-events", render_plan.choose_preset(brief))

    def test_pc_selects_multi_page(self) -> None:
        brief = copy.deepcopy(self.brief)
        brief["game"]["platforms"] = ["pc"]
        self.assertEqual("pc-multi-page", render_plan.choose_preset(brief))

    def test_non_test_environment_is_rejected(self) -> None:
        brief = copy.deepcopy(self.brief)
        brief["project"]["environment"] = "production"
        self.assertIn(
            "project.environment must be sandbox or test", validator.validate(brief)
        )

    def test_dedicated_test_project_requires_acknowledgement(self) -> None:
        brief = copy.deepcopy(self.brief)
        brief["project"]["environment"] = "test"
        self.assertIn(
            "project.test_project_acknowledged must be true for a dedicated test project",
            validator.validate(brief),
        )
        brief["project"]["test_project_acknowledged"] = True
        self.assertEqual([], validator.validate(brief))

    def test_credentials_are_rejected(self) -> None:
        brief = copy.deepcopy(self.brief)
        brief["project"]["api_key"] = "do-not-store-this"
        self.assertIn("project.api_key must not contain credentials", validator.validate(brief))

    def test_same_all_group_is_allowed_for_different_types(self) -> None:
        brief = copy.deepcopy(self.brief)
        brief["catalog"]["groups"].append(
            {"external_id": "__all__", "type": "bundle", "placement": "featured"}
        )
        self.assertEqual([], validator.validate(brief))

    def test_preflight_helpers_do_not_expose_account_login(self) -> None:
        accounts = {
            "ok": True,
            "data": {
                "accounts": [
                    {
                        "login": "private@example.com",
                        "context": "publisher",
                        "active": True,
                        "expired": False,
                    }
                ]
            },
        }
        self.assertTrue(preflight.active_publisher_account(accounts))
        self.assertEqual(
            {"known"},
            preflight.external_ids({"data": [{"external_id": "known"}]}),
        )

    def test_backup_resolves_wrapped_landing_id(self) -> None:
        self.assertEqual(
            "landing-id",
            backup_shop.landing_id({"ok": True, "data": {"_id": "landing-id"}}),
        )

    def test_backup_rejects_missing_landing_id(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "landing _id"):
            backup_shop.landing_id({"ok": True, "data": {}})

    def test_backup_checksum_is_stable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "structure.json"
            path.write_bytes(b"{}\n")
            self.assertEqual(
                "ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356",
                backup_shop.checksum(path),
            )

    def test_eval_targets_pass_at_eight_of_ten(self) -> None:
        runs = [
            {
                "run_id": f"run-{index}",
                "preset": "mobile-single-page",
                "result": "success" if index <= 8 else "failure",
                "manual_interventions": 2,
                "failure": None if index <= 8 else "preview mismatch",
            }
            for index in range(1, 11)
        ]
        summary = summarize_evals.summarize(runs)
        self.assertTrue(summarize_evals.passes(summary))

    def test_eval_target_fails_when_one_run_needs_three_interventions(self) -> None:
        runs = [
            {
                "run_id": f"run-{index}",
                "preset": "pc-multi-page",
                "result": "success",
                "manual_interventions": 3 if index == 1 else 0,
                "failure": None,
            }
            for index in range(1, 11)
        ]
        summary = summarize_evals.summarize(runs)
        self.assertFalse(summarize_evals.passes(summary))


if __name__ == "__main__":
    unittest.main()
