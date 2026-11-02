#!/usr/bin/env bash
set -Eeuo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"
mode="${1:-manual}"

# Fail before expensive CI if material changes lack a fresh audit delta.
# The GitHub event supplies commit IDs. Local/manual runs self-test this
# freshness gate but do not claim certification of an unselected release.
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests/test_validate_audit_ledger_delta.py
if [[ "${GITHUB_EVENT_NAME:-}" == "pull_request" || "${GITHUB_EVENT_NAME:-}" == "push" ]]; then
  : "${AUDIT_LEDGER_BASE_SHA:?AUDIT_LEDGER_BASE_SHA must be supplied by the workflow}"
  : "${AUDIT_LEDGER_HEAD_SHA:?AUDIT_LEDGER_HEAD_SHA must be supplied by the workflow}"
  python3 scripts/validate-audit-ledger-delta.py --base "$AUDIT_LEDGER_BASE_SHA" --head "$AUDIT_LEDGER_HEAD_SHA"
else
  echo 'AUDIT_LEDGER_DELTA=SKIP: non-PR/push run; not a certification result'
fi
bash scripts/absolute-audit-governance-validate.sh "$mode"
bash scripts/agent-continuity-validate.sh
staged_index="${SOLANGE_GIT_INDEX_FILE-}"

check_project_boundaries() {
  local workflows_dir='.github/workflows'
  local marker
  local -a forbidden_markers=(
    'mei-mg-email'
    'mei-mg-email-ndr-guard.service'
    'mei-mg-email-worker.service'
  )

  [ -d "$workflows_dir" ] || return 0
  for marker in "${forbidden_markers[@]}"; do
    if grep -R -n -F --include='*.yml' --include='*.yaml' -- "$marker" "$workflows_dir"; then
      echo "BLOCKED: Solange workflow references foreign project marker: $marker" >&2
      return 44
    fi
  done
}

check_project_boundaries
git diff --check
if [ -n "$staged_index" ]; then
  GIT_INDEX_FILE="$staged_index" git diff --cached --check
else
  git diff --cached --check
fi

# Keep this fast repository policy check in CI; Vitest does not run .mjs tests.
node --test tests/dependabot-no-pr-contract.test.mjs

# The independent required CI workflow runs the application's impact-selected
# lint/typecheck/unit/build/E2E/DB suites. Repeating the entire suite here held
# the shared self-hosted runner for 15 minutes. Always enforce the V5 audit
# bridge, append-only ledger, continuity and project boundaries above.
# Keep full local/pre-push validation below when mode is not CI.
if [[ "$mode" == "ci" ]]; then
  echo 'REPOSITORY_GOVERNANCE_APP_CHECKS=DELEGATED_TO_CI_IMPACT_SCOPE'
  exit 0
fi

[ -d node_modules ] || npm ci
npm run lint
npm run typecheck
npm run arch:check
npm run modules:check
if [ -n "$staged_index" ]; then
  GIT_INDEX_FILE="$staged_index" npm run migrations:check
else
  npm run migrations:check
fi
npm run test:run -- --fileParallelism=false

if [ -f tests/test_ai_conflict_resolver.py ]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests/test_ai_conflict_resolver.py
  elif command -v python >/dev/null 2>&1; then
    PYTHONDONTWRITEBYTECODE=1 python -m unittest tests/test_ai_conflict_resolver.py
  else
    echo 'BLOCKED: Python is required for the AI conflict resolver tests.' >&2
    exit 43
  fi
fi

npm run build
