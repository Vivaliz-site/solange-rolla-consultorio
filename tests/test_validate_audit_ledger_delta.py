"""Red/green fixtures for the audit ledger freshness gate."""

from __future__ import annotations

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts" / "validate-audit-ledger-delta.py"
spec = importlib.util.spec_from_file_location("audit_ledger_delta", SCRIPT)
validator = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(validator)


def execute(repo: Path, *args: str) -> str:
    p = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, check=True)
    return p.stdout.strip()


class LedgerGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="audit-ledger-")
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name)
        execute(self.repo, "init", "-q", "-b", "main")
        execute(self.repo, "config", "user.name", "Audit Test")
        execute(self.repo, "config", "user.email", "audit-test@example.invalid")
        self.write("docs/quality/AUDIT_STATUS.md", "# Audit Status\n\nStatus: NAO_APTO\n")
        self.write("src/example.ts", "export const x = 1;\n")
        self.commit("base")
        self.base = execute(self.repo, "rev-parse", "HEAD")

    def write(self, name: str, value: str):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding="utf-8")

    def commit(self, msg: str) -> str:
        execute(self.repo, "add", ".")
        execute(self.repo, "-c", "commit.gpgsign=false", "commit", "-qm", msg)
        return execute(self.repo, "rev-parse", "HEAD")

    def append_delta(self):
        path = self.repo / validator.LEDGER
        path.write_text(path.read_text(encoding="utf-8") + f"""
<!-- AUDIT_DELTA_V1 -->
## Audit delta
- Base SHA: {self.base}
- Impacto: Escopo do CI e alteracoes relevantes identificadas.
- Testes: RED sem o ledger; GREEN com o registro.
- Evidencias: Resultados de testes e arquivo alterado documentados.
- Pendencias: Validacao de runtime publicado ainda exigida.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->
""", encoding="utf-8")

    def check(self, head: str) -> tuple[bool, str]:
        return validator.evaluate(self.repo, self.base, head)

    def test_governance_workflow_supplies_real_commit_identity(self):
        workflow = (SCRIPT.parents[1] / ".github/workflows/repository-governance.yml").read_text()
        self.assertIn("fetch-depth: 0", workflow)
        self.assertIn("AUDIT_LEDGER_BASE_SHA: " + chr(36) + "{{ github.event.pull_request.base.sha || github.event.before }}", workflow)
        self.assertIn("AUDIT_LEDGER_HEAD_SHA: " + chr(36) + "{{ github.event.pull_request.head.sha || github.sha }}", workflow)

    def test_governance_script_enforces_and_self_tests(self):
        source = (SCRIPT.parents[1] / "scripts/repository-governance-validate.sh").read_text()
        self.assertIn("python3 -m unittest tests/test_validate_audit_ledger_delta.py", source)
        self.assertIn("python3 scripts/validate-audit-ledger-delta.py", source)
        self.assertIn('"' + chr(36) + '{GITHUB_EVENT_NAME:-}" == "pull_request"', source)
        self.assertIn('"' + chr(36) + '{GITHUB_EVENT_NAME:-}" == "push"', source)
        self.assertIn('--base "$AUDIT_LEDGER_BASE_SHA" --head "$AUDIT_LEDGER_HEAD_SHA"', source)
        self.assertIn("bash scripts/absolute-audit-governance-validate.sh", source)

    def test_vm_access_runbook_change_is_material(self):
        self.write("AGENTS-VM-ACCESS.md", "new host requirements\n")
        ok, _ = self.check(self.commit("change authorized access contract"))
        self.assertFalse(ok)

    def test_access_control_matrix_change_is_material(self):
        self.write("docs/ACCESS_CONTROL_MATRIX.md", "new role permissions\n")
        ok, _ = self.check(self.commit("change access control matrix"))
        self.assertFalse(ok)

    def test_schema_migration_is_material(self):
        self.write("supabase/migrations/20261013000000_change.sql", "create table t(id int);\n")
        ok, _ = self.check(self.commit("migration"))
        self.assertFalse(ok)

    def test_renamed_document_to_runtime_is_material(self):
        self.write("docs/notes/memo.md", "prose\n")
        self.commit("documentation")
        execute(self.repo, "mv", "docs/notes/memo.md", "runtime.config")
        ok, _ = self.check(self.commit("move doc to runtime"))
        self.assertFalse(ok)

    def test_material_change_without_ledger_is_red(self):
        self.write("src/example.ts", "export const x = 2;\n")
        ok, message = self.check(self.commit("without evidence"))
        self.assertFalse(ok)
        self.assertIn("without an updated", message)

    def test_material_with_record_is_green(self):
        self.write("src/example.ts", "export const x = 2;\n")
        self.append_delta()
        ok, _ = self.check(self.commit("with evidence"))
        self.assertTrue(ok)

    def test_doc_only_does_not_require_record(self):
        self.write("docs/notes/meeting-notes.md", "notes\n")
        ok, message = self.check(self.commit("docs only"))
        self.assertTrue(ok)
        self.assertIn("SKIP", message)

    def test_policy_document_is_material(self):
        self.write("docs/quality/AUDIT_RUNTIME_PARITY_V1.md", "change\n")
        ok, _ = self.check(self.commit("policy changed"))
        self.assertFalse(ok)

    def test_new_base_changes_do_not_make_docs_only_pr_material(self):
        execute(self.repo, "switch", "-qc", "topic")
        self.write("docs/notes/meeting-notes.md", "a docs change\n")
        topic = self.commit("docs on branch")
        execute(self.repo, "switch", "-q", "main")
        self.write("src/example.ts", "export const x = 2;\n")
        advanced_main = self.commit("material change on main")
        ok, message = validator.evaluate(self.repo, advanced_main, topic)
        self.assertTrue(ok, message)
        self.assertIn("SKIP", message)

    def test_branch_delta_uses_merge_base_even_when_main_moves(self):
        execute(self.repo, "switch", "-qc", "topic")
        self.write("src/example.ts", "export const x = 3;\n")
        self.append_delta()
        topic = self.commit("feature with audit")
        execute(self.repo, "switch", "-q", "main")
        self.write("src/unrelated.ts", "unrelated\n")
        advanced_main = self.commit("another main change")
        ok, message = validator.evaluate(self.repo, advanced_main, topic)
        self.assertTrue(ok, message)

    def test_ledger_only_is_not_recertification(self):
        self.append_delta()
        ok, message = self.check(self.commit("ledger only"))
        self.assertTrue(ok)
        self.assertIn("SKIP", message)

    def test_removing_history_is_not_a_fresh_audit(self):
        self.write("src/example.ts", "export const x = 2;\n")
        self.write(validator.LEDGER, "changed history\n")
        self.append_delta()
        ok, message = self.check(self.commit("rewrite history"))
        self.assertFalse(ok)
        self.assertIn("append only", message)

    def test_empty_or_bogus_evidence_is_not_valid(self):
        self.write("src/example.ts", "export const x = 2;\n")
        self.append_delta()
        p = self.repo / validator.LEDGER
        p.write_text(p.read_text().replace("- Testes: RED sem o ledger; GREEN com o registro.", "- Testes: PASS"))
        ok, _ = self.check(self.commit("fake pass"))
        self.assertFalse(ok)

    def test_incorrect_base_is_rejected(self):
        self.write("src/example.ts", "export const x = 2;\n")
        self.append_delta()
        p = self.repo / validator.LEDGER
        p.write_text(p.read_text().replace(self.base, "f"*40))
        ok, _ = self.check(self.commit("wrong base"))
        self.assertFalse(ok)

    def test_invalid_git_sha_fails_closed(self):
        with self.assertRaises(ValueError):
            self.check("not-a-commit")

    def test_missing_commit_fails_closed(self):
        with self.assertRaises(RuntimeError):
            self.check("f" * 40)

    def test_deleted_ledger_fails_closed(self):
        self.write("src/example.ts", "export const x = 2;\n")
        (self.repo / validator.LEDGER).unlink()
        ok, _ = self.check(self.commit("delete ledger"))
        self.assertFalse(ok)

    def test_ledger_only_deletion_fails_closed(self):
        (self.repo / validator.LEDGER).unlink()
        ok, message = self.check(self.commit("delete only audit ledger"))
        self.assertFalse(ok, message)

    def test_ledger_history_rewrite_without_material_fails(self):
        self.write(validator.LEDGER, "forged historical audit result\n")
        ok, message = self.check(self.commit("forge old ledger without product change"))
        self.assertFalse(ok, message)

    def test_superpowers_spec_change_is_material(self):
        self.write("docs/superpowers/specs/new-security-design.md", "change auth requirements\n")
        ok, message = self.check(self.commit("change security design"))
        self.assertFalse(ok, message)

    def test_superpowers_plan_change_is_material(self):
        self.write("docs/superpowers/plans/new-clinical-plan.md", "change clinical acceptance plan\n")
        ok, message = self.check(self.commit("change clinical plan"))
        self.assertFalse(ok, message)

    def test_project_readme_business_rules_are_material(self):
        self.write("README.md", "Approved cancellation policy changed.\n")
        ok, message = self.check(self.commit("change business rules"))
        self.assertFalse(ok, message)

    def test_release_and_lineage_evidence_is_material(self):
        self.write("docs/releases/new-release.md", "Different release criteria\n")
        ok, message = self.check(self.commit("change release evidence"))
        self.assertFalse(ok, message)

    def test_unknown_markdown_contract_defaults_to_material(self):
        self.write("docs/new-security-contract.md", "new AAL2 invariant\n")
        ok, message = self.check(self.commit("add a new security contract"))
        self.assertFalse(ok, message)

    def test_existing_critical_root_docs_are_material(self):
        for path in (
            "docs/PLATFORM_RESOURCES.md",
            "docs/VERCEL_SETUP.md",
            "docs/BRAND_TOKENS.md",
            "docs/REFERENCES.md",
        ):
            with self.subTest(path=path):
                self.assertTrue(validator.is_material(path), path)

    def test_unknown_extension_is_material(self):
        self.write("runtime.mycustom", "changed\n")
        ok, _ = self.check(self.commit("unknown runtime"))
        self.assertFalse(ok)


if __name__ == "__main__":
    unittest.main()
