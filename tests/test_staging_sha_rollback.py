"""Regressoes de rollback de identidade da release no staging, sem dados reais."""
from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "ops/staging/restore-deployed-sha.sh"
WORKFLOW = ROOT / ".github/workflows/staging-promote.yml"
OLD = "a" * 40
NEW = "b" * 40


class StagingShaRollbackTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="solange-staging-sha-")
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.state = self.root / "state"
        self.state.mkdir()
        self.deployed = self.state / "deployed-sha.txt"
        self.previous = self.state / "previous-deployed-sha.txt"
        self.absent = self.state / "previous-deployed-sha.absent"

    def restore(self):
        return subprocess.run(
            ["sh", str(SCRIPT), str(self.root)],
            capture_output=True, text=True, check=False,
        )

    def test_restores_previous_sha_when_original_was_present(self):
        self.deployed.write_text(NEW + "\n")
        self.previous.write_text(OLD + "\n")
        result = self.restore()
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(OLD + "\n", self.deployed.read_text())
        self.assertFalse(self.previous.exists())

    def test_restores_absence_when_no_sha_existed_before_deploy(self):
        self.deployed.write_text(NEW + "\n")
        self.absent.touch()
        result = self.restore()
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertFalse(self.deployed.exists())
        self.assertFalse(self.absent.exists())

    def test_missing_snapshot_leaves_candidate_untouched(self):
        self.deployed.write_text(NEW + "\n")
        result = self.restore()
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(NEW + "\n", self.deployed.read_text())

    def test_conflicting_snapshots_do_not_change_release_identity(self):
        self.deployed.write_text(NEW + "\n")
        self.previous.write_text(OLD + "\n")
        self.absent.touch()
        result = self.restore()
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(NEW + "\n", self.deployed.read_text())

    def test_candidate_marker_is_published_atomically_after_transaction(self):
        workflow = WORKFLOW.read_text()
        start = workflow.index('          SHA_SWAPPED=1', workflow.index('previous-deployed-sha.absent'))
        transaction = workflow.index('> "$TRANSACTION"', start)
        published = workflow.index('mv "$sha_tmp" "$ROOT/state/deployed-sha.txt"', transaction)
        self.assertLess(start, transaction)
        self.assertLess(transaction, published)

    def test_workflow_calls_same_restore_in_both_failure_paths(self):
        workflow = WORKFLOW.read_text()
        self.assertEqual(2, workflow.count('ops/staging/restore-deployed-sha.sh" "$ROOT"'))
        self.assertIn('previous-deployed-sha.absent', workflow)
        self.assertIn('SHA_SWAPPED=1', workflow)


if __name__ == "__main__":
    unittest.main()
