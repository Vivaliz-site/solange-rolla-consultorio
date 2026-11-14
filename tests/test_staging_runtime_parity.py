"""Adversarial tests for the staging runtime provenance/parity gate.

No runtime writes or live data. All Docker and HTTP responses are fake.
"""
from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "ops" / "staging" / "verify-runtime-parity.py"
spec = importlib.util.spec_from_file_location("solange_runtime_parity", SCRIPT)
guard = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(guard)

GOOD = "a" * 40
OLD = "b" * 40
PUBLIC = "https://synthetic-audit.trycloudflare.com"


class StagingParityTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix="solange-parity-")
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        (self.root / "state").mkdir()
        (self.root / "app").mkdir()
        (self.root / "state/deployed-sha.txt").write_text(GOOD + "\n")
        (self.root / "state/current-url.txt").write_text(PUBLIC + "\n")
        self.env("staging.env", GOOD)
        self.env("app/.env.production.local", GOOD)
        self.status = {c: ("running", "unless-stopped") for c in guard.CONTAINERS}
        self.sha = {(name, key): GOOD for name in guard.WORKERS
                    for key in guard.REQUIRED_SHA_KEYS}
        self.sha.update({(guard.WEB, key): GOOD for key in guard.REQUIRED_SHA_KEYS})
        self.health = {
            "http://127.0.0.1:3200/api/health": {
                "status": "ok", "environment": "staging", "buildSha": GOOD,
            },
            PUBLIC + "/api/health": {
                "status": "ok", "environment": "staging", "buildSha": GOOD,
            },
        }
        self.fail_urls = set()

    def env(self, path, sha):
        (self.root / path).write_text(
            "APP_BUILD_SHA=" + sha + "\n"
            "STAGING_COMMIT_SHA=" + sha + "\n"
            "SUPABASE_SECRET_KEY=synthetic_not_read\n",
            encoding="utf-8",
        )

    def check(self, public=True, target=GOOD):
        def query_state(name):
            if name not in self.status:
                raise RuntimeError("synthetic missing container")
            return self.status[name]
        def env_value(name, key):
            return self.sha[(name, key)]
        def request(url):
            if url in self.fail_urls:
                raise RuntimeError("upstream unavailable")
            return self.health[url]
        with patch.object(guard, "docker_state", side_effect=query_state), \
             patch.object(guard, "docker_env_value", side_effect=env_value), \
             patch.object(guard, "read_health", side_effect=request):
            return guard.audit(self.root, target, public)

    def assert_rejected(self, public=True, target=GOOD):
        result = self.check(public=public, target=target)
        self.assertFalse(result.ok, result.details)
        self.assertTrue(result.details)
        return result

    def test_good_matching_local_public_and_all_workers(self):
        result = self.check()
        self.assertTrue(result.ok, result.details)
        self.assertIn("provenance", result.passed)
        self.assertIn("public_health", result.passed)

    def test_rejects_main_candidate_older_web(self):
        result = self.assert_rejected(target=OLD)
        self.assertIn("state_release_mismatch", result.details)

    def test_rejects_stale_staging_env(self):
        self.env("staging.env", OLD)
        self.assertIn("staging_env_mismatch", self.assert_rejected().details)

    def test_rejects_stale_app_env(self):
        self.env("app/.env.production.local", OLD)
        self.assertIn("app_env_mismatch", self.assert_rejected().details)

    def test_rejects_stale_state(self):
        (self.root / "state/deployed-sha.txt").write_text(OLD + "\n")
        self.assertIn("state_release_mismatch", self.assert_rejected().details)

    def test_rejects_web_sha_divergence(self):
        self.sha[(guard.WEB, "APP_BUILD_SHA")] = OLD
        self.assertIn("web_sha_mismatch", self.assert_rejected().details)

    def test_rejects_worker_sha_divergence(self):
        self.sha[(guard.WORKERS[0], "STAGING_COMMIT_SHA")] = OLD
        self.assertIn("worker_sha_mismatch", self.assert_rejected().details)

    def test_rejects_web_restart_no(self):
        self.status[guard.WEB] = ("running", "no")
        self.assertIn("restart_policy_mismatch", self.assert_rejected().details)

    def test_rejects_tunnel_down(self):
        self.status[guard.TUNNEL] = ("exited", "unless-stopped")
        self.assertIn("container_not_running", self.assert_rejected().details)

    def test_rejects_public_wrong_sha_despite_http_200(self):
        self.health[PUBLIC + "/api/health"]["buildSha"] = OLD
        self.assertIn("public_health_wrong_release", self.assert_rejected().details)

    def test_rejects_public_http_error_or_unavailable(self):
        self.fail_urls.add(PUBLIC + "/api/health")
        self.assertIn("public_health_unavailable", self.assert_rejected().details)

    def test_rejects_public_bad_status(self):
        self.health[PUBLIC + "/api/health"]["status"] = "failed"
        self.assertIn("public_health_invalid", self.assert_rejected().details)

    def test_rejects_public_http_url_and_embedded_credentials(self):
        for url in ("http://synthetic-audit.trycloudflare.com",
                    "https://u:p@synthetic-audit.trycloudflare.com",
                    "https://localhost", "https://synthetic-audit.trycloudflare.com@evil.example"):
            with self.subTest(url=url):
                (self.root / "state/current-url.txt").write_text(url + "\n")
                self.assertIn("public_url_invalid", self.assert_rejected().details)

    def test_rejects_missing_public_url(self):
        (self.root / "state/current-url.txt").unlink()
        self.assertIn("public_url_missing", self.assert_rejected().details)

    def test_local_mode_does_not_claim_public_validation(self):
        self.fail_urls.add(PUBLIC + "/api/health")
        r = self.check(public=False)
        self.assertTrue(r.ok, r.details)
        self.assertNotIn("public_health", r.passed)
        self.assertIn("public_NOT_VALIDATED", r.passed)

    def test_rejects_invalid_expected_sha(self):
        self.assertIn("candidate_sha_invalid", self.assert_rejected(target="main").details)

    def test_rejects_missing_web_and_bad_health(self):
        self.status.pop(guard.WEB)
        self.health["http://127.0.0.1:3200/api/health"]["environment"] = "production"
        r = self.assert_rejected()
        self.assertIn("container_not_running", r.details)
        self.assertIn("local_health_invalid", r.details)

    def test_rejects_duplicate_staging_identity_even_when_last_is_expected(self):
        p=self.root / "staging.env"
        for first in (OLD, GOOD):
            with self.subTest(first=first):
                self.env("staging.env", first)
                with p.open("a",encoding="utf-8") as f:
                    f.write("APP_BUILD_SHA=" + GOOD + "\nSTAGING_COMMIT_SHA=" + GOOD + "\n")
                self.assertIn("staging_env_missing",self.assert_rejected().details)

    def test_rejects_duplicate_app_identity_even_when_last_is_expected(self):
        p=self.root / "app/.env.production.local"
        self.env("app/.env.production.local", OLD)
        with p.open("a",encoding="utf-8") as f:
            f.write("APP_BUILD_SHA=" + GOOD + "\nSTAGING_COMMIT_SHA=" + GOOD + "\n")
        self.assertIn("app_env_missing",self.assert_rejected().details)

    def test_read_health_rejects_duplicate_build_sha_keys(self):
        class Response:
            status=200
            def __init__(self,data): self.data=data
            def __enter__(self): return self
            def __exit__(self,*args): return False
            def geturl(self): return guard.LOCAL_HEALTH_URL
            def read(self,size): return self.data
        for first in (OLD,GOOD):
            raw=('{"status":"ok","environment":"staging","buildSha":"'
                 + first + '","buildSha":"' + GOOD + '"}').encode()
            with self.subTest(first=first):
                with patch.object(guard,"urlopen",return_value=Response(raw)):
                    with self.assertRaises(ValueError):
                        guard.read_health("http://127.0.0.1:3200/api/health")

    def test_read_health_rejects_duplicate_status_keys(self):
        class Response:
            status=200
            def __enter__(self): return self
            def __exit__(self,*args): return False
            def geturl(self): return guard.LOCAL_HEALTH_URL
            def read(self,size):
                return ('{"status":"bad","status":"ok","environment":"staging",'
                        '"buildSha":"' + GOOD + '"}').encode()
        with patch.object(guard,"urlopen",return_value=Response()):
            with self.assertRaises(ValueError):
                guard.read_health("http://127.0.0.1:3200/api/health")

    def test_workflow_runs_guard_before_browser_acceptance(self):
        wf = (SCRIPT.parents[2] / ".github/workflows/staging-promote.yml").read_text()
        gate = wf.index("ops/staging/verify-runtime-parity.py")
        browser = wf.index("- name: Real UI staging homologation")
        self.assertLess(gate, browser, "runtime drift must block misleading browser validation")
        self.assertIn('--expected-sha "$PROMOTE_SHA"', wf)
        self.assertIn('--require-public', wf)

    def test_no_secret_diagnostics(self):
        self.env("staging.env", OLD)
        r = self.assert_rejected()
        self.assertNotIn("synthetic_not_read", repr(r))


if __name__ == "__main__":
    unittest.main()
