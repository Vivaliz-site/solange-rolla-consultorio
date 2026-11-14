#!/usr/bin/env python3
"""Block material commits without an append-only, traceable audit delta entry.

This is a *freshness* gate, not an AUDIT_VERDICT=APTO certifier.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

LEDGER = "docs/quality/AUDIT_STATUS.md"
BEGIN = "<!-- AUDIT_DELTA_V1 -->"
END = "<!-- /AUDIT_DELTA_V1 -->"

# Conservative: unknown files are material unless explicitly documentary.
MATERIAL_DOCUMENTS = {
    "AGENTS.md", "AGENTS.override.md", "AGENTS-VM-ACCESS.md", "CLAUDE.md", "GEMINI.md",
    "AI-TO-CLI-PROTOCOL.md", "REGRAS-AGENTES-CENTRALIZADAS.md",
    "AUDIT_POLICY.md", "REPOSITORY-GOVERNANCE.md",
    "docs/ARCHITECTURE.md", "docs/DEFINITION_OF_DONE.md",
    "docs/SECURITY_PRIVACY.md", "docs/LEGAL_COMPLIANCE.md",
    "docs/ENVIRONMENTS.md", "docs/SCHEMA_OWNERSHIP.md",
    "docs/DATA_MODEL.md", "docs/REQUIREMENTS_TRACEABILITY.md",
    "docs/ACCESS_CONTROL_MATRIX.md", "docs/AGENT_EXECUTION_WORKFLOW.md",
    "docs/AGENT_OPERATING_MODEL.md", "docs/INTEGRATIONS.md",
    "docs/TESTING_DEPLOYMENT.md", "docs/MODULE_BOUNDARIES.md",
    "docs/SCHEMA_OWNERSHIP.md", "docs/PRODUCT_FLOWS.md",
    "docs/DATA_INVENTORY.md", "docs/PROJECT_MASTER_PLAN.md",
    "docs/PROJECT_AGENT_MEMORY.md", "docs/CREDENTIALS-ROTATION-BEFORE-PRODUCTION.md",
}
MATERIAL_DOC_PREFIXES = ("docs/quality/", "docs/operations/", "docs/adr/",
                         "docs/homologacao/", "docs/knowledge/",
                         "docs/superpowers/", "docs/releases/", "docs/legacy/")
# Only expressly non-normative notes are exempt. Unknown documents fail closed.
NONMATERIAL_DOC_PREFIXES = ("docs/notes/",)


def is_material(path: str) -> bool:
    if path == LEDGER:
        return False
    if path in MATERIAL_DOCUMENTS or path.startswith(MATERIAL_DOC_PREFIXES):
        return True
    if path.startswith("docs/") and path.endswith(".md"):
        return not path.startswith(NONMATERIAL_DOC_PREFIXES)
    if path.endswith(".md") and "/" not in path:
        return True
    # Other files, including build/CI, fixtures, scripts and unknown paths,
    # need an explicit audit delta before merging.
    return True


def git(root: Path, *args: str) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(root), *args], capture_output=True, check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"git {args[0]} failed ({result.returncode}): "
            f"{result.stderr.decode('utf-8', errors='replace').strip()[:400]}"
        )
    return result.stdout


def validate_sha(root: Path, sha: str) -> str:
    if not re.fullmatch(r"[0-9a-fA-F]{40}", sha):
        raise ValueError("base/head SHA must be a full 40-character hexadecimal commit ID")
    value = git(root, "rev-parse", "--verify", f"{sha}^{{commit}}")
    return value.decode("ascii").strip()


def changed_paths(root: Path, base: str, head: str) -> list[str]:
    diff = git(
        root, "diff", "--name-only", "-z", "--no-renames", "--diff-filter=ACDMRTUXB",
        base, head, "--",
    )
    return sorted(set(item.decode("utf-8", errors="surrogateescape")
                      for item in diff.split(b"\x00") if item))


def commit_file(root: Path, sha: str, path: str) -> str:
    return git(root, "show", f"{sha}:{path}").decode("utf-8")


def evaluate(root: Path, base_sha: str, head_sha: str) -> tuple[bool, str]:
    base, head = validate_sha(root, base_sha), validate_sha(root, head_sha)
    # A PR may branch from an older base: audit *its* changes, not unrelated
    # commits subsequently merged into the protected branch.
    common_base = git(root, "merge-base", base, head).decode("ascii").strip()
    paths = changed_paths(root, common_base, head)
    # Ledger integrity is mandatory even for documentation-only changes.
    # No missing ledger or rewritten history can be silently treated as SKIP.
    try:
        before = commit_file(root, common_base, LEDGER)
        after = commit_file(root, head, LEDGER)
    except RuntimeError as error:
        return False, f"required audit ledger is unreadable: {error}"
    if not after.startswith(before):
        return False, "audit ledger must preserve its previous history (append only)"
    critical = [item for item in paths if is_material(item)]
    if not critical:
        return True, "SKIP: no material change in the compared commits"
    if LEDGER not in paths:
        return False, (f"material paths changed ({len(critical)}) without an updated "
                       f"{LEDGER}; include an audit delta and evidence")

    added = after[len(before):]
    if added.count(BEGIN) != 1 or added.count(END) != 1:
        return False, "append one AUDIT_DELTA_V1 evidence record to the ledger"
    if not added.strip().startswith(BEGIN) or not added.strip().endswith(END):
        return False, "the new audit delta must be a complete, final ledger record"

    section = added.split(BEGIN, 1)[1].split(END, 1)[0]
    fields = {}
    for line in section.splitlines():
        match = re.fullmatch(r"- (Base SHA|Impacto|Testes|Evidencias|Pendencias|Estado):\s*(.*)", line)
        if match:
            fields[match.group(1)] = match.group(2).strip()
    required = ("Base SHA", "Impacto", "Testes", "Evidencias", "Pendencias", "Estado")
    if any(not fields.get(name) for name in required):
        return False, "AUDIT_DELTA_V1 requires all six nonempty evidence fields"
    if fields["Base SHA"].strip(chr(96)) != common_base:
        return False, "audit delta Base SHA does not match the compared merge-base commit"
    if fields["Estado"] != "NAO_APTO":
        return False, "this freshness gate cannot certify APTO; use Estado: NAO_APTO"
    # Avoid a token-only update masquerading as completed verification.
    if any(fields[field].strip().upper() in {"TODO", "PENDING", "PASS", "OK", "N/A", "NA"}
           for field in ("Impacto", "Testes", "Evidencias", "Pendencias")):
        return False, "evidence fields must contain substantive, scoped information"
    return True, (f"PASS: {len(critical)} material file(s) covered by an append-only "
                  f"AUDIT_DELTA_V1 record; this is not production certification")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", required=True)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    args = parser.parse_args()
    try:
        ok, message = evaluate(args.root, args.base, args.head)
    except (ValueError, RuntimeError, UnicodeDecodeError) as error:
        ok, message = False, f"FAIL_CLOSED: {error}"
    print(f"AUDIT_LEDGER_DELTA={'PASS' if ok else 'FAIL'}: {message}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
