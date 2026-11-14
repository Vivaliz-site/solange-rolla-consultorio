"""Fail-closed preflight for the legacy local Docker backup scheduler.

Only synthetic fake-Docker fixtures. Never contacts staging, Supabase or patient data.
"""
import os
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "ops" / "backup" / "run-demo-scheduler.sh"
REF = "abcdefghijklmnopqrst"
PROD = "zyxwvutsrqponmlkjihg"


class SchedulerPreflightTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="solange-scheduler-preflight-")
        self.addCleanup(temp.cleanup)
        self.path = pathlib.Path(temp.name)
        (self.path / "bin").mkdir()
        root = self.path / "root"
        (root / "scripts").mkdir(parents=True)
        (root / "ops" / "backup").mkdir(parents=True)
        for file in (
            root / "scripts" / "backup-homologation.sh",
            root / "scripts" / "check-backup-health.sh",
            root / "ops" / "backup" / "run-scheduler.sh",
        ):
            file.write_text("#!/bin/sh\nexit 0\n")
        self.log = self.path / "unexpected-docker.log"
        docker = self.path / "bin" / "docker"
        docker.write_text("""#!/bin/sh
if [ "$1" = exec ] && [ "$3" = printenv ]; then
  case "$4" in
    NEXT_PUBLIC_SUPABASE_URL) printf '%s\\n' "$FAKE_RUNTIME_URL"; exit 0;;
    SUPABASE_STAGING_PROJECT_REF) printf '%s\\n' "$FAKE_RUNTIME_REF"; exit 0;;
    SUPABASE_PRODUCTION_PROJECT_REF) printf '%s\\n' "$FAKE_PROD_REF"; exit 0;;
  esac
fi
printf '%s\\n' "$1" >> "$FAKE_DOCKER_LOG"
exit 13
""")
        docker.chmod(0o755)
        self.demo = self.path / "demo"
        self.env = {
            **os.environ,
            "ROOT": str(root), "DEMO": str(self.demo),
            "PATH": str(self.path / "bin") + ":" + os.environ["PATH"],
            "FAKE_RUNTIME_URL": f"https://{REF}.supabase.co",
            "FAKE_RUNTIME_REF": REF,
            "FAKE_PROD_REF": PROD,
            "FAKE_DOCKER_LOG": str(self.log),
        }

    def check(self):
        return subprocess.run(["bash", str(SCRIPT)], env=self.env,
                              capture_output=True, text=True, timeout=7)

    def test_managed_runtime_refused_before_destructive_docker(self):
        result = self.check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("scheduler_refused: managed_supabase_runtime", result.stderr)
        self.assertFalse(self.log.exists())
        self.assertFalse(self.demo.exists())

    def test_unknown_identity_fails_closed(self):
        self.env["FAKE_RUNTIME_REF"] = ""
        result = self.check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("scheduler_refused: runtime_identity_unknown", result.stderr)
        self.assertFalse(self.log.exists())

    def test_cross_project_fails_closed(self):
        self.env["FAKE_RUNTIME_URL"] = f"https://{PROD}.supabase.co"
        result = self.check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("scheduler_refused: runtime_identity_mismatch", result.stderr)
        self.assertFalse(self.log.exists())

    def test_local_runtime_reaches_installer(self):
        self.env["FAKE_RUNTIME_URL"] = "http://127.0.0.1:54321"
        result = self.check()
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("scheduler_refused:", result.stderr)
        self.assertTrue(self.log.exists())
        self.assertIn("rm", self.log.read_text())

    def test_error_does_not_print_foreign_url(self):
        secret = "secret.example.invalid"
        self.env["FAKE_RUNTIME_URL"] = "https://" + secret
        result = self.check()
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(secret, result.stdout + result.stderr)
        self.assertFalse(self.log.exists())


if __name__ == "__main__":
    unittest.main()
