#!/usr/bin/env python3
"""Conservative CI scope selection for the Solange clinical application.

Isolated documentation and its mandatory append-only audit ledger do not
require clinical UI/DB test infrastructure. The independent health endpoint
and managed backup metadata verifier need core checks but not a clinical DB.
Everything unknown/shared/security-sensitive is FULL.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

SHA_RE = re.compile(r"^[0-9a-f]{40}$")
SECURITY_DOCS = {
    "AGENTS.md", "AGENTS.override.md", "CLAUDE.md", "GEMINI.md",
    "AUDIT_POLICY.md", "REGRAS-AGENTES-CENTRALIZADAS.md",
}
SECURITY_PREFIXES = (
    ".github/", "docs/quality/", "docs/operations/", "docs/runbooks/",
    "supabase/", "ops/", "src/platform/", "src/modules/",
)
ISOLATED_HEALTH = {"src/app/api/health/route.ts"}
# The mandatory governance gate checks the audit ledger independently.
AUDIT_LEDGER = "docs/quality/AUDIT_STATUS.md"
# Read-only metadata verifier: no DB writes, migrations, restore or clinical UI.
MANAGED_BACKUP_METADATA = {
    "scripts/verify-managed-backup-evidence.py",
    "tests/test_managed_backup_evidence.py",
}

# These files govern PR reviewer routing, not the clinical application, schema,
# or database runtime. The independent required Repository Governance Gate
# executes and tests the modified reviewer/ledger checks on the exact HEAD.
# Unknown workflows, grants, agent policy, CI selector and all other scripts
# must continue to request FULL CI (fail closed).
REVIEW_ROUTING_GOVERNANCE = {
    ".github/CODEOWNERS",
    "scripts/check_pr_review_routing.py",
    "scripts/repository-governance-validate.sh",
    "tests/test_pr_review_routing.py",
}


def classify(paths: list[str] | None, *, force_full: bool = False) -> dict[str, object]:
    files = sorted(set(p.strip().replace("\\", "/").removeprefix("./")
                       for p in (paths or []) if p.strip()))
    groups: set[str] = set()
    unsafe: list[str] = []
    if force_full or not files:
        unsafe.append("push_or_unavailable_diff")
    for file in files:
        if file.startswith("/") or "//" in file or ".." in file.split("/"):
            unsafe.append(file)
        elif file == AUDIT_LEDGER:
            groups.add("audit_ledger")
        elif file in MANAGED_BACKUP_METADATA:
            groups.add("managed_backup_metadata")
        elif file in REVIEW_ROUTING_GOVERNANCE:
            groups.add("pr_review_governance")
        elif file in SECURITY_DOCS or file.startswith(SECURITY_PREFIXES):
            unsafe.append(file)
        elif file in ISOLATED_HEALTH:
            groups.add("health")
        elif file == "README.md" or (file.startswith("docs/") and file.endswith(".md")):
            groups.add("docs")
        else:
            # Other APIs, components, contracts, test suites and dependencies
            # must be analyzed conservatively, not assumed isolated.
            unsafe.append(file)
    # A ledger-only PR has no material subsystem diff: fail closed.
    if groups == {"audit_ledger"} and not unsafe:
        unsafe.append("audit_ledger_without_component_change")
    full = bool(unsafe)
    return {
        "mode": "full" if full else "scoped",
        "groups": ["full"] if full else sorted(groups),
        "changed_files": files,
        "full_reasons": sorted(set(unsafe)),
        "run_core": full or "health" in groups or "managed_backup_metadata" in groups,
        "run_e2e": full,
        "run_db": full,
    }


def changed_paths(base: str, head: str) -> list[str] | None:
    if not SHA_RE.fullmatch(base) or not SHA_RE.fullmatch(head):
        return None
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", "-z", f"{base}...{head}"],
            check=True, capture_output=True, timeout=30,
        )
        return [p.decode("utf-8", "replace") for p in result.stdout.split(b"\x00") if p]
    except (OSError, subprocess.SubprocessError):
        return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="")
    parser.add_argument("--head", default="")
    parser.add_argument("--force-full", action="store_true")
    parser.add_argument("--file", action="append")
    parser.add_argument("--github-output", default="")
    args = parser.parse_args()
    files = args.file if args.file is not None else changed_paths(args.base, args.head)
    result = classify(files, force_full=args.force_full or files is None)
    if args.github_output:
        with Path(args.github_output).open("a", encoding="utf-8") as handle:
            handle.write(f"mode={result['mode']}\n")
            handle.write(f"groups={','.join(result['groups'])}\n")
            for key in ("run_core", "run_e2e", "run_db"):
                handle.write(f"{key}={str(result[key]).lower()}\n")
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
