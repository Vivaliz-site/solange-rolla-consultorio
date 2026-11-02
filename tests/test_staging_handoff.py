"""Postmerge handoff: no deployment until canonical main gates are green."""
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch
from io import StringIO

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("handoff", ROOT / "scripts" / "dispatch-staging-after-ci.py")
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)
SHA = "a" * 40
RUN = 42


def workflow(name, run_id, status="completed", conclusion="success",
             created="2026-11-02T14:00:00Z", sha=SHA):
    return dict(name=name, id=run_id, status=status, conclusion=conclusion,
                created_at=created, head_sha=sha, head_branch="main",
                event="workflow_dispatch")


def payload(extra=None):
    runs = [workflow("CI", RUN, "in_progress", None),
            workflow("Database", 1),
            workflow("Repository Governance Gate", 2),
            workflow("Absolute Audit Main Guard", 3)] + (extra or [])
    return dict(workflow_runs=runs, total_count=len(runs))


class HandoffTests(unittest.TestCase):
    def test_all_postmerge_gates_green_dispatch(self):
        self.assertEqual("DISPATCH", mod.decision(SHA, RUN, SHA, payload()))

    def test_main_advanced_does_not_dispatch(self):
        self.assertEqual("SKIP_MAIN_ADVANCED", mod.decision(SHA, RUN, "b" * 40, payload()))

    def test_previously_dispatched_is_idempotent(self):
        self.assertEqual("SKIP_ALREADY_DISPATCHED", mod.decision(
            SHA, RUN, SHA, payload([workflow("Staging Promote", 8, "completed", "failure")])))

    def test_ci_run_identity_is_required(self):
        value = payload()
        value["workflow_runs"][0]["id"] = 21
        with self.assertRaisesRegex(mod.HandoffError, "origin_ci_not_verified"):
            mod.decision(SHA, RUN, SHA, value)

    def test_missing_main_validation_fails_closed(self):
        for name in mod.REQUIRED:
            value = payload()
            value["workflow_runs"] = [r for r in value["workflow_runs"] if r["name"] != name]
            value["total_count"] = len(value["workflow_runs"])
            with self.subTest(name=name), self.assertRaises(mod.HandoffError):
                mod.decision(SHA, RUN, SHA, value)

    def test_latest_failed_check_takes_precedence(self):
        value = payload([workflow("Database", 9, "completed", "failure", "2026-11-02T15:00:00Z")])
        with self.assertRaisesRegex(mod.HandoffError, "not_green_Database"):
            mod.decision(SHA, RUN, SHA, value)

    def test_queued_check_does_not_dispatch(self):
        value = payload()
        value["workflow_runs"][1]["status"] = "queued"
        value["workflow_runs"][1]["conclusion"] = None
        with self.assertRaisesRegex(mod.HandoffError, "not_green_Database"):
            mod.decision(SHA, RUN, SHA, value)

    def test_other_sha_is_not_valid_evidence(self):
        value = payload()
        value["workflow_runs"][1]["head_sha"] = "b" * 40
        with self.assertRaisesRegex(mod.HandoffError, "missing_Database"):
            mod.decision(SHA, RUN, SHA, value)

    def test_pagination_incomplete_fails_closed(self):
        value = payload()
        value["total_count"] += 1
        with self.assertRaisesRegex(mod.HandoffError, "incomplete_runs_page"):
            mod.decision(SHA, RUN, SHA, value)

    def test_non_bot_actor_cannot_use_permission(self):
        env = {"GITHUB_SHA": SHA, "GITHUB_REPOSITORY": "Vivaliz-site/solange-rolla-consultorio",
               "GITHUB_ACTOR": "fredmourao-ai", "GITHUB_EVENT_NAME": "workflow_dispatch",
               "GITHUB_REF": "refs/heads/main"}
        with patch.dict("os.environ", env, clear=True), patch.object(mod, "github_request") as request, \
                patch("sys.stdout", new_callable=StringIO):
            self.assertEqual(0, mod.run())
            request.assert_not_called()

    def test_bot_dispatches_existing_workflow_only(self):
        env = {"GITHUB_SHA": SHA, "GITHUB_REPOSITORY": "Vivaliz-site/solange-rolla-consultorio",
               "GITHUB_ACTOR": "github-actions[bot]", "GITHUB_EVENT_NAME": "workflow_dispatch",
               "GITHUB_REF": "refs/heads/main", "GITHUB_RUN_ID": str(RUN), "GITHUB_TOKEN": "synthetic_only"}
        replies = [{"object": {"sha": SHA}}, payload(), None]
        calls = []

        def request(repo, token, method, path, body=None):
            calls.append((method, path, body))
            return replies[len(calls) - 1]

        with patch.dict("os.environ", env, clear=True), \
                patch.object(mod, "github_request", side_effect=request), \
                patch("sys.stdout", new_callable=StringIO):
            self.assertEqual(0, mod.run())
        self.assertEqual(["GET", "GET", "POST"], [x[0] for x in calls])
        self.assertEqual("/actions/workflows/staging-promote.yml/dispatches", calls[-1][1])
        self.assertEqual({"ref": "main", "inputs": {"commit_sha": SHA}}, calls[-1][2])

    def test_job_permissions_and_dependencies_are_narrow(self):
        yaml = (ROOT / ".github" / "workflows" / "ci.yml").read_text()
        job = yaml.split("\n  canonical-postmerge-staging-handoff:", 1)[1]
        self.assertIn("needs: [impact_scope, lint, typecheck, unit, architecture, build, e2e]", job)
        self.assertIn("github.event_name == 'workflow_dispatch'", job)
        self.assertIn("github.actor == 'github-actions[bot]'", job)
        self.assertIn("runs-on: [self-hosted, Linux, ARM64, solange-ci]", job)
        self.assertIn("actions: write", job)
        self.assertIn("persist-credentials: false", job)
        self.assertIn("python3 scripts/dispatch-staging-after-ci.py", job)


if __name__ == "__main__":
    unittest.main()
