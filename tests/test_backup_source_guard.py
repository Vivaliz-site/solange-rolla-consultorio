"""Provenance regressions for local legacy backup and freshness healthcheck."""
from __future__ import annotations
import hashlib
import os
import pathlib
import subprocess
import tempfile
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
BACKUP=ROOT/"scripts"/"backup-homologation.sh"
HEALTH=ROOT/"scripts"/"check-backup-health.sh"
REF="abcdefghijklmnopqrst"
PROD="zyxwvutsrqponmlkjihg"

class SourceGuardTests(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory(prefix="solange-backup-guard-")
        self.addCleanup(t.cleanup)
        self.path=pathlib.Path(t.name)
        (self.path/"bin").mkdir()
        self.log=self.path/"unexpected-docker.log"
        fake=self.path/"bin"/"docker"
        fake.write_text("""#!/bin/sh
if [ "$1" = exec ] && [ "$3" = printenv ]; then
 case "$4" in
 NEXT_PUBLIC_SUPABASE_URL) printf '%s\\n' "$FAKE_RUNTIME_URL"; exit 0;;
 SUPABASE_STAGING_PROJECT_REF) printf '%s\\n' "$FAKE_RUNTIME_REF"; exit 0;;
 SUPABASE_PRODUCTION_PROJECT_REF) printf '%s\\n' "$FAKE_PROD_REF"; exit 0;;
 esac
fi
printf 'unexpected docker invocation\\n' >> "$FAKE_DOCKER_LOG"
exit 13
""")
        fake.chmod(0o700)
        self.env={**os.environ,"PATH":str(self.path/"bin")+":"+os.environ["PATH"],
                  "FAKE_RUNTIME_URL":f"https://{REF}.supabase.co",
                  "FAKE_RUNTIME_REF":REF,"FAKE_PROD_REF":PROD,
                  "FAKE_DOCKER_LOG":str(self.log),
                  "SOLANGE_BACKUP_DEST":str(self.path),
                  "SOLANGE_DB_CONTAINER":"supabase_db_solange-client-demo",
                  "SOLANGE_BACKUP_EXPECTED_PROJECT_REF":REF}
    def run_cmd(self,script):
        return subprocess.run(["sh",str(script)],capture_output=True,text=True,
                              env=self.env,check=False)
    def test_legacy_backup_rejects_managed_runtime_before_dump(self):
        result=self.run_cmd(BACKUP)
        self.assertNotEqual(result.returncode,0)
        self.assertIn("backup_failed: source_identity_mismatch",result.stderr)
        self.assertFalse(self.log.exists())
    def test_missing_web_runtime_identity_fails_closed(self):
        self.env["FAKE_RUNTIME_REF"]=""
        result=self.run_cmd(BACKUP)
        self.assertNotEqual(result.returncode,0)
        self.assertIn("backup_failed: runtime_identity_unknown",result.stderr)
        self.assertFalse(self.log.exists())
    def test_cross_project_runtime_identity_fails_closed(self):
        self.env["FAKE_RUNTIME_URL"]=f"https://{PROD}.supabase.co"
        result=self.run_cmd(BACKUP)
        self.assertNotEqual(result.returncode,0)
        self.assertIn("backup_failed: runtime_identity_mismatch",result.stderr)
        self.assertFalse(self.log.exists())
    def test_url_host_spoof_is_not_accepted(self):
        self.env["FAKE_RUNTIME_URL"]=f"https://{REF}.supabase.co.evil.example"
        result=self.run_cmd(BACKUP)
        self.assertNotEqual(result.returncode,0)
        self.assertIn("backup_failed: runtime_identity_mismatch",result.stderr)
    def test_production_ref_is_not_staging(self):
        self.env["FAKE_PROD_REF"]=REF
        result=self.run_cmd(BACKUP)
        self.assertNotEqual(result.returncode,0)
        self.assertIn("backup_failed: runtime_identity_unknown",result.stderr)
    def test_local_runtime_is_not_labelled_managed(self):
        self.env["FAKE_RUNTIME_URL"]="http://127.0.0.1:54321"
        result=self.run_cmd(BACKUP)
        self.assertNotEqual(result.returncode,0)
        self.assertNotIn("source_identity_mismatch",result.stderr)
        self.assertTrue(self.log.exists()) # reached actual local dump path
    def fixture(self,metadata):
        full=self.path/"solange-homologacao-test.dump"
        subset=self.path/"solange-homologacao-app-auth-test.dump"
        for file in (full,subset):
            file.write_bytes(b"synthetic-fixture-content")
            digest=hashlib.sha256(file.read_bytes()).hexdigest()
            file.with_name(file.name+".sha256").write_text(f"{digest}  {file}\n")
        (self.path/"LAST_SUCCESS").write_text(
            "2026-10-13T00:00:00Z "+metadata+
            f" full={full.name} restore_subset={subset.name}\n")
    def test_health_rejects_legacy_backup_without_provenance(self):
        self.fixture("")
        result=self.run_cmd(HEALTH)
        self.assertNotEqual(result.returncode,0)
        self.assertIn("backup_unhealthy: source_provenance",result.stderr)
    def test_health_rejects_foreign_source_ref(self):
        self.fixture(f"source_kind=managed_supabase source_ref={PROD}")
        result=self.run_cmd(HEALTH)
        self.assertNotEqual(result.returncode,0)
        self.assertIn("backup_unhealthy: source_provenance",result.stderr)
    def test_health_accepts_correct_managed_source_only_with_valid_checksums(self):
        self.fixture(f"source_kind=managed_supabase source_ref={REF}")
        result=self.run_cmd(HEALTH)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn("backup_healthy",result.stdout)
    def test_health_fails_when_expected_ref_missing(self):
        self.fixture(f"source_kind=managed_supabase source_ref={REF}")
        del self.env["SOLANGE_BACKUP_EXPECTED_PROJECT_REF"]
        # Docker read of the web ref is permitted as a fallback.
        result=self.run_cmd(HEALTH)
        self.assertEqual(result.returncode,0,result.stderr)
    def test_health_rejects_wrong_checksum_even_correct_identity(self):
        self.fixture(f"source_kind=managed_supabase source_ref={REF}")
        (self.path/"solange-homologacao-test.dump").write_bytes(b"tampered")
        result=self.run_cmd(HEALTH)
        self.assertNotEqual(result.returncode,0)
        self.assertIn("checksum",result.stderr)
    def test_existing_ci_unit_job_runs_restore_target_security_regressions(self):
        # An apparently green normal CI must not omit the destination guard.
        workflow=(ROOT/".github"/"workflows"/"ci.yml").read_text()
        self.assertIn("test_restore_drill_target_guard.py",workflow)
        self.assertIn("Staging Python security regressions",workflow)

    def test_no_sensitive_material_in_diagnostics(self):
        self.env["FAKE_RUNTIME_URL"]="https://SECRET_MARKER@example.invalid"
        result=self.run_cmd(BACKUP)
        self.assertNotIn("SECRET_MARKER",result.stdout+result.stderr)

if __name__=="__main__": unittest.main()
