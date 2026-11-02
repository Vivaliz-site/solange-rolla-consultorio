#!/usr/bin/env python3
"""Dispatch the EXISTING staging workflow after exact-SHA post-merge gates.

Never promotes a database directly. The staging workflow still enforces the
managed-backup, environment, release SHA and single-writer gates.
"""
from __future__ import annotations

import json
import os
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SHA_RE = re.compile(r"[0-9a-f]{40}\Z")
REPO_RE = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z")
REQUIRED = ("Database", "Repository Governance Gate", "Absolute Audit Main Guard")


class HandoffError(Exception):
    pass


def decision(sha: str, run_id: int, main_sha: str, payload: dict) -> str:
    """Pure fail-closed decision; all inputs come from authenticated GitHub API."""
    if not SHA_RE.fullmatch(sha) or not SHA_RE.fullmatch(main_sha):
        raise HandoffError("invalid_sha")
    if main_sha != sha:
        return "SKIP_MAIN_ADVANCED"
    if not isinstance(payload, dict) or not isinstance(payload.get("workflow_runs"), list):
        raise HandoffError("invalid_runs_payload")
    if payload.get("total_count", 0) > len(payload["workflow_runs"]):
        raise HandoffError("incomplete_runs_page")
    runs = [r for r in payload["workflow_runs"] if isinstance(r, dict)
            and r.get("head_sha") == sha and r.get("head_branch") == "main"
            and r.get("event") == "workflow_dispatch"]
    ci = [r for r in runs if r.get("id") == run_id and r.get("name") == "CI"]
    if len(ci) != 1 or ci[0].get("status") not in ("in_progress", "completed"):
        raise HandoffError("origin_ci_not_verified")
    if any(r.get("name") == "Staging Promote" for r in runs):
        return "SKIP_ALREADY_DISPATCHED"
    for name in REQUIRED:
        candidates = [r for r in runs if r.get("name") == name]
        if not candidates:
            raise HandoffError("required_workflow_missing_" + name.replace(" ", "_"))
        latest = max(candidates, key=lambda r: (str(r.get("created_at", "")), int(r.get("id", 0))))
        if latest.get("status") != "completed" or latest.get("conclusion") != "success":
            raise HandoffError("required_workflow_not_green_" + name.replace(" ", "_"))
    return "DISPATCH"


def github_request(repo: str, token: str, method: str, path: str, body: dict | None = None):
    if not REPO_RE.fullmatch(repo) or not token:
        raise HandoffError("invalid_environment")
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = Request(
        "https://api.github.com/repos/" + repo + path,
        data=data,
        method=method,
        headers={"Authorization": "Bearer " + token,
                 "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28",
                 **({"Content-Type": "application/json"} if data is not None else {})},
    )
    try:
        with urlopen(request, timeout=20) as response:
            status = response.status
            raw = response.read(400000)
    except HTTPError as exc:
        raise HandoffError("github_http_" + str(exc.code)) from None
    except (URLError, TimeoutError):
        raise HandoffError("github_transport_unavailable") from None
    if method == "POST":
        if status != 204:
            raise HandoffError("dispatch_not_accepted")
        return None
    if status != 200:
        raise HandoffError("github_read_http_" + str(status))
    try:
        return json.loads(raw)
    except ValueError:
        raise HandoffError("github_invalid_json") from None


def run() -> int:
    sha = os.getenv("GITHUB_SHA", "")
    repo = os.getenv("GITHUB_REPOSITORY", "")
    token = os.getenv("GITHUB_TOKEN", "")
    if not SHA_RE.fullmatch(sha) or not REPO_RE.fullmatch(repo):
        raise HandoffError("untrusted_context")
    if (os.getenv("GITHUB_EVENT_NAME") != "workflow_dispatch"
            or os.getenv("GITHUB_REF") != "refs/heads/main"
            or os.getenv("GITHUB_ACTOR") != "github-actions[bot]"):
        print("STAGING_HANDOFF=SKIP_NOT_CANONICAL_BOT_DISPATCH")
        return 0
    try:
        run_id = int(os.getenv("GITHUB_RUN_ID", "0"))
    except ValueError:
        raise HandoffError("invalid_run_id") from None
    if run_id <= 0:
        raise HandoffError("invalid_run_id")
    main = github_request(repo, token, "GET", "/git/ref/heads/main")
    ref_sha = str(main.get("object", {}).get("sha", ""))
    if ref_sha != sha:
        print("STAGING_HANDOFF=SKIP_MAIN_ADVANCED")
        return 0
    payload = github_request(repo, token, "GET", "/actions/runs?head_sha=" + sha + "&event=workflow_dispatch&per_page=100")
    result = decision(sha, run_id, ref_sha, payload)
    if result == "DISPATCH":
        github_request(repo, token, "POST", "/actions/workflows/staging-promote.yml/dispatches",
                       {"ref": "main", "inputs": {"commit_sha": sha}})
        print("STAGING_HANDOFF=DISPATCH_ACCEPTED workflow=staging-promote.yml sha=" + sha)
    else:
        print("STAGING_HANDOFF=" + result)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(run())
    except HandoffError as exc:
        print("STAGING_HANDOFF=FAIL reason=" + str(exc), file=sys.stderr)
        raise SystemExit(1)
