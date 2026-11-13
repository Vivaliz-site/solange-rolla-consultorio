"""Fail closed before Docker sees an unverified local restore archive.

Only synthetic archive bytes and a fake Docker executable are used.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "verify-backup-restore-docker.sh"


class LocalRestoreIntegrityTests(unittest.TestCase):
    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory(prefix="solange-local-restore-integrity-")
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        bin_dir = root / "bin"
        bin_dir.mkdir()
        self.backup = root / "fixture.dump"
        self.backup.write_bytes(b"synthetic local backup fixture only")
        self.marker = root / "docker-called"
        docker = bin_dir / "docker"
        docker.write_text('#!/bin/sh\nprintf "called\\n" >> "$FAKE_DOCKER_MARKER"\nexit 19\n')
        docker.chmod(0o755)
        self.env = {
            **os.environ,
            "PATH": str(bin_dir) + ":" + os.environ.get("PATH", ""),
            "FAKE_DOCKER_MARKER": str(self.marker),
            "BACKUP_FILE": str(self.backup),
        }

    def run_drill(self) -> subprocess.CompletedProcess[str]:
        return subprocess.run(["sh", str(SCRIPT)], env=self.env,
                              capture_output=True, text=True, timeout=8)

    @unittest.skipIf(os.name == "nt", "exige shell POSIX e ferramentas de checksum Unix")
    def test_missing_checksum_rejected_before_docker(self) -> None:
        result = self.run_drill()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.marker.exists(), result.stderr)

    @unittest.skipIf(os.name == "nt", "exige shell POSIX e ferramentas de checksum Unix")
    def test_mismatched_checksum_rejected_before_docker(self) -> None:
        (Path(str(self.backup) + ".sha256")).write_text("0" * 64 + "  fixture.dump\n")
        result = self.run_drill()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.marker.exists(), result.stderr)

    @unittest.skipIf(os.name == "nt", "exige shell POSIX e ferramentas de checksum Unix")
    def test_symlink_archive_rejected_before_docker(self) -> None:
        link = self.backup.parent / "archive-link.dump"
        link.symlink_to(self.backup)
        self.env["BACKUP_FILE"] = str(link)
        (Path(str(link) + ".sha256")).write_text(
            hashlib.sha256(self.backup.read_bytes()).hexdigest() + "  archive-link.dump\n"
        )
        result = self.run_drill()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.marker.exists(), result.stderr)

    def test_existing_unit_ci_runs_docker_checksum_regressions(self) -> None:
        ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text()
        self.assertIn("test_backup_docker_integrity_guard.py", ci)

    @unittest.skipIf(os.name == "nt", "exige shell POSIX e ferramentas de checksum Unix")
    def test_valid_checksum_passes_preflight_only(self) -> None:
        (Path(str(self.backup) + ".sha256")).write_text(
            hashlib.sha256(self.backup.read_bytes()).hexdigest() + "  fixture.dump\n"
        )
        result = self.run_drill()
        # The fake Docker executable exits 19, proving the preflight reached
        # Docker without claiming that a real clinical restore succeeded.
        self.assertEqual(result.returncode, 19)
        self.assertTrue(self.marker.exists())


if __name__ == "__main__":
    unittest.main()
