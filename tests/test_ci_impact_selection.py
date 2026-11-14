from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("solange_ci_scope", ROOT / "scripts/ci-impact-selection.py")
assert spec and spec.loader
selector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selector)


class ScopedSolangeCI(unittest.TestCase):
    def test_isolated_documentation_skips_clinical_and_database_suites(self):
        result = selector.classify(["README.md", "docs/reference/changes.md"])
        self.assertEqual(result["groups"], ["docs"])
        self.assertEqual(result["mode"], "scoped")
        self.assertFalse(result["run_core"])
        self.assertFalse(result["run_e2e"])
        self.assertFalse(result["run_db"])

    def test_own_health_api_keeps_core_but_not_clinical_db(self):
        result = selector.classify(["src/app/api/health/route.ts"])
        self.assertEqual(result["groups"], ["health"])
        self.assertTrue(result["run_core"])
        self.assertFalse(result["run_e2e"])
        self.assertFalse(result["run_db"])

    def test_shared_dependency_and_clinical_apis_require_all(self):
        for file in (
            "src/platform/observability/logger.ts",
            "src/app/api/public/formulario/draft/route.ts",
            "src/modules/people/services/update.ts",
            "supabase/migrations/20261001.sql",
            ".github/workflows/db.yml",
            "package-lock.json",
            "docs/quality/AUDIT_STATUS.md",
            "AGENTS.md",
            "ops/staging/promote.sh",
        ):
            with self.subTest(file=file):
                result = selector.classify([file])
                self.assertEqual(result["mode"], "full")
                self.assertTrue(result["run_e2e"])
                self.assertTrue(result["run_db"])

    def test_mixed_isolated_and_shared_is_full(self):
        result = selector.classify(["README.md", "src/app/api/public/consulta/respond/route.ts"])
        self.assertEqual(result["mode"], "full")

    def test_independent_health_and_docs_union(self):
        result = selector.classify(["docs/reference/changes.md", "src/app/api/health/route.ts"])
        self.assertEqual(result["groups"], ["docs", "health"])

    def test_fail_closed_on_diff_failure_push_and_path_traversal(self):
        self.assertEqual(selector.classify(None)["mode"], "full")
        self.assertEqual(selector.classify([])["mode"], "full")
        self.assertEqual(selector.classify(["README.md"], force_full=True)["mode"], "full")
        self.assertEqual(selector.classify(["../docs/reference/foo.md"])["mode"], "full")
        self.assertIsNone(selector.changed_paths("", "bad"))

    def test_audit_ledger_does_not_force_unrelated_clinical_gates(self):
        result = selector.classify(["README.md", "docs/quality/AUDIT_STATUS.md"])
        self.assertEqual(result["mode"], "scoped")
        self.assertEqual(result["groups"], ["audit_ledger", "docs"])
        for check in ("run_core", "run_e2e", "run_db"):
            self.assertFalse(result[check], check)

    def test_managed_backup_metadata_needs_core_but_not_live_db(self):
        result = selector.classify([
            "scripts/verify-managed-backup-evidence.py",
            "tests/test_managed_backup_evidence.py",
            "docs/quality/AUDIT_STATUS.md",
        ])
        self.assertEqual(result["mode"], "scoped")
        self.assertEqual(result["groups"], ["audit_ledger", "managed_backup_metadata"])
        self.assertTrue(result["run_core"])
        self.assertFalse(result["run_e2e"])
        self.assertFalse(result["run_db"])

    def test_unknown_backup_or_security_change_still_full(self):
        for changed in (
            ["scripts/backup-homologation.sh", "docs/quality/AUDIT_STATUS.md"],
            [".github/workflows/staging-promote.yml", "scripts/verify-managed-backup-evidence.py"],
            ["supabase/migrations/20261031.sql", "docs/quality/AUDIT_STATUS.md"],
            ["docs/quality/GLOBAL_AUDIT_MANIFEST.json", "docs/quality/AUDIT_STATUS.md"],
        ):
            with self.subTest(changed=changed):
                result = selector.classify(changed)
                self.assertEqual(result["mode"], "full")
                self.assertTrue(result["run_db"])
                self.assertTrue(result["run_e2e"])
                self.assertNotIn("audit_ledger_without_component_change", result["full_reasons"])

    def test_duplicate_paths_are_stable(self):
        self.assertEqual(selector.classify(["README.md", "README.md"])["changed_files"], ["README.md"])


    def test_review_governance_isolated_from_clinical_and_database_suites(self):
        changed = [
            ".github/CODEOWNERS",
            "scripts/check_pr_review_routing.py",
            "scripts/repository-governance-validate.sh",
            "tests/test_pr_review_routing.py",
            "docs/quality/AUDIT_STATUS.md",
        ]
        result = selector.classify(changed)
        self.assertEqual(result["mode"], "scoped")
        self.assertEqual(result["groups"], ["audit_ledger", "pr_review_governance"])
        self.assertEqual(result["full_reasons"], [])
        for gate in ("run_core", "run_e2e", "run_db"):
            self.assertFalse(result[gate], gate)

    def test_review_governance_mixed_with_clinical_or_security_contract_is_full(self):
        for other in (
            "src/modules/clinical/services/update.ts",
            "src/platform/supabase/client.ts",
            "supabase/migrations/20261102.sql",
            "AGENTS.md",
            ".github/workflows/ci.yml",
            ".github/workflows/absolute-audit-governance.yml",
            "scripts/validate-owner-pr-grant.py",
            "scripts/ci-impact-selection.py",
            "tests/test_ci_impact_selection.py",
            "scripts/backup-homologation.sh",
        ):
            with self.subTest(other=other):
                result = selector.classify([
                    ".github/CODEOWNERS", "docs/quality/AUDIT_STATUS.md", other
                ])
                self.assertEqual(result["mode"], "full")
                self.assertTrue(result["run_core"])
                self.assertTrue(result["run_e2e"])
                self.assertTrue(result["run_db"])

    def test_arbitrary_governance_prefix_is_not_a_wildcard_exemption(self):
        for path in (".github/FUNDING.yml", "scripts/check_other_guard.py", "tests/test_other_guard.py"):
            with self.subTest(path=path):
                self.assertEqual(selector.classify([path])["mode"], "full")

    def test_architecture_is_required_but_not_repeated_inside_build(self):
        # Branch protection requires both architecture and build status contexts.
        workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        architecture = workflow.split("\n  architecture:\n", 1)[1].split("\n  build:\n", 1)[0]
        build = workflow.split("\n  build:\n", 1)[1].split("\n  e2e:\n", 1)[0]
        self.assertIn("npm run arch:check", architecture)
        self.assertIn("npm run modules:check", architecture)
        self.assertNotIn("npm run arch:check", build)
        self.assertNotIn("npm run modules:check", build)


if __name__ == "__main__":
    unittest.main()
