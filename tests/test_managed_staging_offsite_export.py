"""Synthetic contract tests for a managed-staging-only encrypted offsite export.

No clinical records, passwords, tokens, OCI writes or real network calls.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "backup-managed-staging-offsite.py"
spec = importlib.util.spec_from_file_location("solange_managed_offsite_backup", SCRIPT)
backup = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(backup)

STAGE = "abcdefghijklmnopqrst"
PROD = "zyxwvutsrqponmlkjihg"
FINGERPRINT = "ABCDEF0123456789ABCDEF0123456789ABCDEF01"


def good_env():
    return {
        "SUPABASE_STAGING_PROJECT_REF": STAGE,
        "SUPABASE_PRODUCTION_PROJECT_REF": PROD,
        "NEXT_PUBLIC_SUPABASE_URL": f"https://{STAGE}.supabase.co",
        "SUPABASE_MANAGED_DB_HOST": "aws-0-sa-east-1.pooler.supabase.com",
        "SUPABASE_MANAGED_DB_PORT": "5432",
        "SUPABASE_MANAGED_DB_USER": f"postgres.{STAGE}",
        "SUPABASE_DB_PASSWORD": "synthetic-password-never-log",
        "SOLANGE_BACKUP_GPG_RECIPIENT": FINGERPRINT,
        "SOLANGE_BACKUP_OCI_NAMESPACE": "tenanttest",
        "SOLANGE_BACKUP_OCI_BUCKET": "private-clinic-backup",
    }


class ManagedOffsiteContract(unittest.TestCase):
    def test_good_canonical_identity(self):
        config = backup.validate_config(good_env())
        self.assertEqual(config["source_ref"], STAGE)
        self.assertEqual(config["db_host"], good_env()["SUPABASE_MANAGED_DB_HOST"])
        self.assertEqual(config["db_user"], f"postgres.{STAGE}")

    def test_requires_current_project_match(self):
        env = good_env()
        env["NEXT_PUBLIC_SUPABASE_URL"] = f"https://{PROD}.supabase.co"
        with self.assertRaisesRegex(backup.BackupBlocked, "runtime_project_identity_mismatch"):
            backup.validate_config(env)

    def test_refuses_production_as_staging(self):
        env = good_env()
        env["SUPABASE_PRODUCTION_PROJECT_REF"] = STAGE
        with self.assertRaisesRegex(backup.BackupBlocked, "project_isolation_invalid"):
            backup.validate_config(env)

    def test_pooler_username_must_bind_project_ref(self):
        env = good_env()
        env["SUPABASE_MANAGED_DB_USER"] = f"postgres.{PROD}"
        with self.assertRaisesRegex(backup.BackupBlocked, "database_identity_mismatch"):
            backup.validate_config(env)

    def test_untrusted_source_host_is_rejected(self):
        for bad in ["attacker.example", "aws-0-sa-east-1.pooler.supabase.com.evil",
                    "127.0.0.1", "db." + PROD + ".supabase.co"]:
            env = good_env()
            env["SUPABASE_MANAGED_DB_HOST"] = bad
            with self.subTest(host=bad), self.assertRaises(backup.BackupBlocked):
                backup.validate_config(env)

    def test_rejects_transaction_pooler_port(self):
        env = good_env()
        env["SUPABASE_MANAGED_DB_PORT"] = "6543"
        with self.assertRaisesRegex(backup.BackupBlocked, "database_session_port_invalid"):
            backup.validate_config(env)

    def test_pg_client_major_must_match_managed_postgres17(self):
        self.assertEqual(backup.pg_dump_major("pg_dump (PostgreSQL) 17.6"), 17)
        with self.assertRaisesRegex(backup.BackupBlocked, "pg_dump_major_mismatch"):
            backup.require_pg17("pg_dump (PostgreSQL) 16.15 (Ubuntu 16.15)")
        backup.require_pg17("pg_dump (PostgreSQL) 17.6")

    def test_grant_is_failing_closed(self):
        with self.assertRaisesRegex(backup.BackupBlocked, "owner_write_grant_missing"):
            backup.require_owner_grant(good_env())
        env = good_env()
        env["SOLANGE_MANAGED_BACKUP_OWNER_GRANT"] = "scoped-191-v1"
        backup.require_owner_grant(env)

    def test_private_oci_bucket_mandatory(self):
        backup.require_private_oci_bucket({"public-access-type": "NoPublicAccess"})
        for value in ("ObjectRead", "ObjectReadWithoutList", None):
            with self.subTest(value=value), self.assertRaisesRegex(backup.BackupBlocked, "oci_bucket_not_private"):
                backup.require_private_oci_bucket({"public-access-type": value})

    def test_dump_command_contains_only_app_scopes(self):
        conf = backup.validate_config(good_env())
        cmd = backup.make_pg_dump_command(conf, "/usr/lib/postgresql/17/bin/pg_dump")
        for schema in ("public", "clinical", "auth", "storage"):
            self.assertIn(f"--schema={schema}", cmd)
        self.assertIn("--no-owner", cmd)
        self.assertIn("--no-acl", cmd)
        self.assertNotIn(good_env()["SUPABASE_DB_PASSWORD"], " ".join(cmd))
        self.assertNotIn("production", " ".join(cmd))

    def test_write_grant_denied_before_any_external_call(self):
        env = good_env()
        with patch.object(backup, "execute_encrypted_export") as export:
            self.assertEqual(backup.main(["--execute"], env=env), 2)
            export.assert_not_called()

    def test_real_destination_key_is_unpredictable_and_never_overwrites_latest(self):
        key = backup.object_key(STAGE, "20261108T071000Z", "a" * 32)
        self.assertTrue(key.startswith(f"managed-solange-staging/{STAGE}/"))
        self.assertTrue(key.endswith(".dump.gpg"))
        self.assertNotIn("latest", key)

    def test_explicit_storage_gap_does_not_certify_recovery(self):
        self.assertEqual(backup.BACKUP_SCOPE_VERDICT, "DB_ONLY_STORAGE_NOT_BACKED_UP")


if __name__ == "__main__":
    unittest.main()
