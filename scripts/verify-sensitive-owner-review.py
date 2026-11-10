#!/usr/bin/env python3
"""Fail closed on unreviewed owner grants before Solange auto-merge.

The grant's approved_by JSON field is not evidence of a GitHub review.
The workflow must verify the real reviewer and the exact PR HEAD via GitHub API.
This helper neither grants permission nor performs a merge.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys

OWNER = "shopvivaliz-human"
SENSITIVE_PREFIX = "security/owner-approvals/"
SHA_RE = re.compile(r"[0-9a-f]{40}\Z")


class ReviewVerificationError(Exception):
    """API/shape error: fail closed."""


def _api(path: str, *, pages: bool = False):
    command = ["gh", "api"]
    if pages:
        command += ["--paginate", "--slurp"]
    command.append(path)
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise ReviewVerificationError("github_api_unavailable")
    try:
        data = json.loads(result.stdout)
    except (ValueError, TypeError) as exc:
        raise ReviewVerificationError("github_api_invalid_json") from exc
    if not pages:
        if not isinstance(data, dict):
            raise ReviewVerificationError("github_api_invalid_object")
        return data
    if not isinstance(data, list) or not all(isinstance(page, list) for page in data):
        raise ReviewVerificationError("github_api_invalid_pages")
    if len(data) > 30:  # GitHub PR files are capped at 3,000 entries.
        raise ReviewVerificationError("github_api_unexpected_page_count")
    return [entry for page in data for entry in page]


def needs_owner_approval(files: list[dict]) -> bool:
    if not files:
        raise ReviewVerificationError("github_pr_files_missing")
    for entry in files:
        if not isinstance(entry, dict) or not isinstance(entry.get("filename"), str):
            raise ReviewVerificationError("github_pr_file_path_missing")
    return any(entry["filename"].lstrip("/").startswith(SENSITIVE_PREFIX) for entry in files)


def valid_exact_owner_review(reviews: list[dict], head_sha: str) -> bool:
    if not SHA_RE.fullmatch(head_sha):
        return False
    owner_reviews = []
    for review in reviews:
        if not isinstance(review, dict):
            raise ReviewVerificationError("github_review_invalid")
        user = review.get("user")
        if isinstance(user, dict) and user.get("login") == OWNER:
            if not isinstance(review.get("id"), int) or not review.get("submitted_at"):
                raise ReviewVerificationError("github_review_metadata_invalid")
            owner_reviews.append(review)
    if not owner_reviews:
        return False
    # The most recent review is authoritative. DISMISSED/CHANGES_REQUESTED
    # cannot be hidden behind an older APPROVED, and a new HEAD revokes it.
    owner_reviews.sort(key=lambda r: (r["submitted_at"], r["id"]))
    latest = owner_reviews[-1]
    return latest.get("state") == "APPROVED" and latest.get("commit_id") == head_sha


def check(repo: str, number: int, head_sha: str) -> str:
    if not SHA_RE.fullmatch(head_sha):
        raise ReviewVerificationError("invalid_head_sha")
    pr = _api(f"repos/{repo}/pulls/{number}")
    head = pr.get("head") or {}
    base = pr.get("base") or {}
    if (pr.get("state") != "open" or head.get("sha") != head_sha or
            base.get("ref") != "main" or
            (head.get("repo") or {}).get("full_name") != repo or
            (base.get("repo") or {}).get("full_name") != repo):
        raise ReviewVerificationError("github_pr_identity_or_head_changed")
    files = _api(f"repos/{repo}/pulls/{number}/files?per_page=100", pages=True)
    if not needs_owner_approval(files):
        return "NOT_APPLICABLE"
    reviews = _api(f"repos/{repo}/pulls/{number}/reviews?per_page=100", pages=True)
    if not valid_exact_owner_review(reviews, head_sha):
        raise ReviewVerificationError("human_owner_approval_missing_for_exact_head")
    return "AUTHORIZED"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--pr", type=int, required=True)
    parser.add_argument("--head", required=True)
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repo) or args.pr < 1:
        print("OWNER_PR_REVIEW=FAIL invalid_reference")
        return 2
    try:
        verdict = check(args.repo, args.pr, args.head)
    except ReviewVerificationError as exc:
        print(f"OWNER_PR_REVIEW=BLOCKED {exc}")
        return 3
    print(f"OWNER_PR_REVIEW={verdict}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
