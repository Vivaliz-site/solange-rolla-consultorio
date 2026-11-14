"""Adversarial integration of staging env rollback using disposable synthetic files."""
from __future__ import annotations

import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "ops" / "staging" / "runtime-env-transaction.sh"
WORKFLOW = ROOT / ".github" / "workflows" / "staging-promote.yml"
PREVIOUS = "synthetic_original_secret_1"
NEW = "synthetic_candidate_secret_2"


class StagingEnvTransactionTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="solange-env-rollback-")
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name) / "directory with spaces"
        self.root.mkdir(parents=True)
        (self.root / "state").mkdir()
        self.env = self.root / "staging.env"
        self.backup = self.root / "state" / "staging-env-predeploy.backup"
        self.absent = self.root / "state" / "staging-env-predeploy.absent"

    def invoke(self, action: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["sh", str(SCRIPT), action, str(self.root)],
            capture_output=True,
            text=True,
            check=False,
        )

    def assert_ok(self, action: str):
        result = self.invoke(action)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn(PREVIOUS, result.stdout + result.stderr)
        self.assertNotIn(NEW, result.stdout + result.stderr)
        return result

    def test_rollback_restores_existing_env_and_permissions(self):
        self.env.write_text(PREVIOUS)
        os.chmod(self.env, 0o600)
        self.assert_ok("snapshot")
        self.assertTrue(self.backup.is_file())
        self.assertEqual(stat.S_IMODE(self.backup.stat().st_mode), 0o600)
        self.env.write_text(NEW)
        self.assert_ok("restore")
        self.assertEqual(self.env.read_text(), PREVIOUS)
        self.assertEqual(stat.S_IMODE(self.env.stat().st_mode), 0o600)
        self.assertFalse(self.backup.exists())
        self.assertFalse(self.absent.exists())

    def test_rollback_restores_absence_when_new_runtime_created(self):
        self.assert_ok("snapshot")
        self.assertTrue(self.absent.exists())
        self.env.write_text(NEW)
        self.assert_ok("restore")
        self.assertFalse(self.env.exists())
        self.assertFalse(self.absent.exists())

    def test_finalize_retains_promoted_config_and_cleans_backup(self):
        self.env.write_text(PREVIOUS)
        self.assert_ok("snapshot")
        self.env.write_text(NEW)
        self.assert_ok("finalize")
        self.assertEqual(self.env.read_text(), NEW)
        self.assertFalse(self.backup.exists())
        self.assertFalse(self.absent.exists())

    def test_finalize_absent_previous_keeps_new_config(self):
        self.assert_ok("snapshot")
        self.env.write_text(NEW)
        self.assert_ok("finalize")
        self.assertEqual(self.env.read_text(), NEW)
        self.assertFalse(self.absent.exists())

    def test_existing_snapshot_prevents_clobber(self):
        self.env.write_text(PREVIOUS)
        self.assert_ok("snapshot")
        self.env.write_text(NEW)
        result = self.invoke("snapshot")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.backup.read_text(), PREVIOUS)

    def test_ambiguous_backup_and_absence_markers_fail_closed(self):
        self.env.write_text(PREVIOUS)
        self.assert_ok("snapshot")
        self.absent.write_text("")
        result = self.invoke("restore")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.env.read_text(), PREVIOUS)

    def test_missing_backup_does_not_discard_new_config(self):
        self.env.write_text(NEW)
        result = self.invoke("restore")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.env.read_text(), NEW)

    def test_missing_state_root_is_rejected(self):
        self.root.joinpath("state").rmdir()
        self.env.write_text(PREVIOUS)
        result = self.invoke("snapshot")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.env.read_text(), PREVIOUS)

    def test_unknown_action_rejected_without_mutation(self):
        self.env.write_text(PREVIOUS)
        result = self.invoke("delete")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.env.read_text(), PREVIOUS)

    def test_workflow_snapshots_before_rewriting_env(self):
        workflow = WORKFLOW.read_text()
        snapshot = workflow.index('ops/staging/runtime-env-transaction.sh" snapshot "$ROOT"')
        rewrite = workflow.index('python3 - "$ROOT/demo.env" "$RUNTIME_ENV"')
        self.assertLess(snapshot, rewrite)

    def test_workflow_rolls_back_both_failure_paths(self):
        workflow = WORKFLOW.read_text()
        first = workflow.index('ops/staging/runtime-env-transaction.sh" restore "$ROOT"')
        failure = workflow.index("- name: Rollback staging release after failed validation")
        second = workflow.index('ops/staging/runtime-env-transaction.sh" restore "$ROOT"', failure)
        self.assertLess(first, failure)
        self.assertGreater(second, failure)

    def test_workflow_finalizes_only_after_acceptance(self):
        workflow = WORKFLOW.read_text()
        acceptance = workflow.index("- name: Real UI staging homologation")
        finalize = workflow.index("- name: Finalize promoted release")
        call = workflow.index('ops/staging/runtime-env-transaction.sh" finalize "$ROOT"', finalize)
        self.assertLess(acceptance, finalize)
        self.assertGreater(call, finalize)


if __name__ == "__main__":
    unittest.main()
