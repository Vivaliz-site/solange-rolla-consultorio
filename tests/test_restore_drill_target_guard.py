"""Synthetic RED/GREEN: restore targets must be disposable local PostgreSQL only."""
from __future__ import annotations
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "verify-backup-restore.sh"
LOCAL = "postgresql://postgres@127.0.0.1:55432/solange_restore"
REMOTE = "postgresql://postgres@db.abcdefghijklmnopqrst.supabase.co:5432/postgres"

class RestoreTargetGuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="restore-guard-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.file = self.root / "synthetic.dump"
        self.file.write_bytes(b"synthetic, no clinical data")
        digest = hashlib.sha256(self.file.read_bytes()).hexdigest()
        self.sum = Path(str(self.file) + ".sha256")
        self.sum.write_text(f"{digest}  {self.file}\n")
        self.log = self.root / "calls.log"
        psql = self.bin / "psql"
        psql.write_text(
            '#!/bin/sh\nprintf "psql\\n" >> "$FAKE_LOG"\n'
            'case "$*" in *restore_drill_only*) printf "%s\\n" "$FAKE_MARKER";; '
            '*) printf "%s\\n" "$FAKE_RESULT";; esac\n'
        )
        psql.chmod(0o755)
        restore = self.bin / "pg_restore"
        restore.write_text('#!/bin/sh\nprintf "pg_restore:%s\\n" "$*" >> "$FAKE_LOG"\nexit 0\n')
        restore.chmod(0o755)

    def run_drill(self, uri=LOCAL, marker="READY", result="t|t|t|t|t",
                  env_name="staging_restore_drill"):
        env = dict(os.environ)
        env.update({
            "PATH": f"{self.bin}:{os.environ.get('PATH', '')}",
            "FAKE_LOG": str(self.log), "FAKE_MARKER": marker,
            "FAKE_RESULT": result, "RESTORE_DB_URL": uri,
            "RESTORE_ENV": env_name, "BACKUP_FILE": str(self.file),
        })
        return subprocess.run(["bash", str(SCRIPT)], env=env, capture_output=True,
                              text=True, timeout=7)

    def calls(self):
        return self.log.read_text() if self.log.exists() else ""

    def test_remote_supabase_refused_before_restore(self):
        r = self.run_drill(REMOTE)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Refusing restore", r.stderr)
        self.assertNotIn("pg_restore:", self.calls())

    def test_loopback_non_disposable_database_refused(self):
        r = self.run_drill("postgresql://postgres@127.0.0.1:55432/postgres")
        self.assertNotEqual(r.returncode, 0)
        self.assertNotIn("pg_restore:", self.calls())

    def test_embedded_password_refused_and_not_logged(self):
        secret = "fake_sensitive_password"
        r = self.run_drill("postgresql://postgres:" + secret +
                           "@127.0.0.1:55432/solange_restore")
        self.assertNotEqual(r.returncode, 0)
        self.assertNotIn("pg_restore:", self.calls())
        self.assertNotIn(secret, r.stderr + r.stdout)

    def test_target_without_isolation_marker_refused(self):
        r = self.run_drill(marker="DENY")
        self.assertNotEqual(r.returncode, 0)
        self.assertNotIn("pg_restore:", self.calls())

    def test_checksum_mismatch_refused_before_connect(self):
        self.sum.write_text("0" * 64 + "  " + str(self.file) + "\n")
        r = self.run_drill()
        self.assertNotEqual(r.returncode, 0)
        self.assertNotIn("psql", self.calls())
        self.assertNotIn("pg_restore:", self.calls())

    def test_missing_rls_after_restore_fails(self):
        r = self.run_drill(result="t|t|t|f|f")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("pg_restore:", self.calls())
        self.assertNotIn("Restore verification completed", r.stdout)

    def test_disposable_target_requires_transaction(self):
        r = self.run_drill()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("--single-transaction", self.calls())
        self.assertIn("--exit-on-error", self.calls())
        self.assertIn("Restore verification completed", r.stdout)

    def test_non_drill_environment_refused(self):
        r = self.run_drill(env_name="production")
        self.assertNotEqual(r.returncode, 0)
        self.assertNotIn("pg_restore:", self.calls())

if __name__ == "__main__":
    unittest.main()
