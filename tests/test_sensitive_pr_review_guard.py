"""Synthetic regression for Solange protected-grant auto-merge approval.

No GitHub write, no clinical data, no real API calls.
"""
import importlib.util
import json
from pathlib import Path
from unittest import TestCase, main
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "verify-sensitive-owner-review.py"
spec = importlib.util.spec_from_file_location("sensitive_review", MODULE_PATH)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
HEAD = "a" * 40
OLD = "b" * 40
REPO = "Vivaliz-site/solange-rolla-consultorio"


def review(*, sha=HEAD, state="APPROVED", user=guard.OWNER, ident=1, when="2026-11-10T09:00:00Z"):
    return {"id": ident, "submitted_at": when, "state": state,
            "user": {"login": user}, "commit_id": sha}


def pr():
    return {"state": "open", "head": {"sha": HEAD, "repo": {"full_name": REPO}},
            "base": {"ref": "main", "repo": {"full_name": REPO}}}


class OwnerReviewGuard(TestCase):
    def test_common_technical_pr_requires_no_owner_review(self):
        self.assertFalse(guard.needs_owner_approval([{"filename": "src/safe-fix.ts"}]))

    def test_grant_add_modify_or_remove_requires_review(self):
        for status in ("added", "modified", "removed", "renamed"):
            self.assertTrue(guard.needs_owner_approval([
                {"filename": "security/owner-approvals/a.json", "status": status}
            ]))

    def test_rename_away_from_protected_grant_requires_review(self):
        # GitHub reports the destination in filename and the old protected
        # location in previous_filename. Never classify that as ordinary.
        files = [{"status": "renamed", "filename": "docs/old-grant.json",
                  "previous_filename": "security/owner-approvals/managed-staging-backup-191.json"}]
        self.assertTrue(guard.needs_owner_approval(files))

    def test_rename_with_missing_previous_filename_fails_closed(self):
        with self.assertRaises(guard.ReviewVerificationError):
            guard.needs_owner_approval([{"status": "renamed", "filename": "docs/a.json"}])

    def test_empty_or_malformed_file_inventory_fails_closed(self):
        for files in ([], [{"filename": None}], [None]):
            with self.assertRaises(guard.ReviewVerificationError):
                guard.needs_owner_approval(files)

    def test_review_not_requested_and_approved_field_not_enough(self):
        self.assertFalse(guard.valid_exact_owner_review([], HEAD))
        self.assertFalse(guard.valid_exact_owner_review([review(user="fredmourao-ai")], HEAD))

    def test_valid_exact_commit_owner_approval(self):
        self.assertTrue(guard.valid_exact_owner_review([review()], HEAD))

    def test_old_sha_is_not_valid_for_current_head(self):
        self.assertFalse(guard.valid_exact_owner_review([review(sha=OLD)], HEAD))

    def test_latest_dismissal_revokes_earlier_approval(self):
        self.assertFalse(guard.valid_exact_owner_review([
            review(ident=1), review(ident=2, state="DISMISSED", when="2026-11-10T09:01:00Z")
        ], HEAD))

    def test_latest_changes_requested_revokes_approval(self):
        self.assertFalse(guard.valid_exact_owner_review([
            review(ident=1), review(ident=2, state="CHANGES_REQUESTED", when="2026-11-10T09:01:00Z")
        ], HEAD))

    def test_malformed_owner_review_fails_closed(self):
        with self.assertRaises(guard.ReviewVerificationError):
            guard.valid_exact_owner_review([{"user": {"login": guard.OWNER}, "state": "APPROVED"}], HEAD)

    def test_api_status_denied_fails_closed(self):
        response = type("Result", (), {"returncode": 1, "stdout": "", "stderr": "403"})()
        with patch.object(guard.subprocess, "run", return_value=response):
            with self.assertRaises(guard.ReviewVerificationError):
                guard._api("repos/x/y")

    def test_pagination_rejects_truncated_bad_shapes(self):
        response = type("Result", (), {"returncode": 0, "stdout": json.dumps({"results": []}), "stderr": ""})()
        with patch.object(guard.subprocess, "run", return_value=response):
            with self.assertRaises(guard.ReviewVerificationError):
                guard._api("repos/x/y", pages=True)

    def test_real_grant_without_review_cannot_authorize(self):
        with patch.object(guard, "_api", side_effect=[
            pr(), [{"filename": "security/owner-approvals/managed-staging-backup-191.json"}], [],
        ]):
            with self.assertRaisesRegex(guard.ReviewVerificationError, "human_owner_approval_missing"):
                guard.check(REPO, 329, HEAD)

    def test_protected_grant_with_exact_review_authorizes(self):
        with patch.object(guard, "_api", side_effect=[
            pr(), [{"filename": "security/owner-approvals/managed-staging-backup-191.json"}], [review()],
        ]):
            self.assertEqual(guard.check(REPO, 330, HEAD), "AUTHORIZED")

    def test_ordinary_pr_does_not_fetch_reviews(self):
        with patch.object(guard, "_api", side_effect=[
            pr(), [{"filename": "src/clinic-view.ts"}],
        ]) as fetch:
            self.assertEqual(guard.check(REPO, 330, HEAD), "NOT_APPLICABLE")
            self.assertEqual(fetch.call_count, 2)

    def test_pr_sha_race_fails_closed(self):
        current = pr()
        current["head"]["sha"] = OLD
        with patch.object(guard, "_api", return_value=current) as api:
            with self.assertRaisesRegex(guard.ReviewVerificationError, "github_pr_identity"):
                guard.check(REPO, 330, HEAD)
            self.assertEqual(api.call_count, 1)

    def test_workflow_wires_owner_guard_before_merge_candidate(self):
        content = (MODULE_PATH.parents[1] / ".github/workflows/pr-auto-merge.yml").read_text()
        call = 'python3 scripts/verify-sensitive-owner-review.py'
        output = 'echo "pr_number=$pr_number"'
        self.assertIn(call, content)
        self.assertLess(content.index(call), content.index(output))


if __name__ == "__main__":
    main()
