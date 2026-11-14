"""Adversarial synthetic health endpoint and CI coverage tests, no live providers."""
from __future__ import annotations

import importlib.util
import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "ops/staging/verify-runtime-parity.py"
spec = importlib.util.spec_from_file_location("health_redirect_guard", SCRIPT)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
GOOD = "a" * 40
JSON_BODY = json.dumps(
    {"status": "ok", "environment": "staging", "buildSha": GOOD}
).encode("utf-8")


class FakeResponse:
    status = 200

    def __init__(self, final_url: str):
        self.final_url = final_url

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def geturl(self):
        return self.final_url

    def read(self, size):
        return JSON_BODY


class HealthRedirectTests(unittest.TestCase):
    def test_rejects_matching_sha_from_different_host(self):
        requested = "http://127.0.0.1:3200/api/health"
        with patch.object(guard, "urlopen", return_value=FakeResponse(
            "https://forged-health.invalid/api/health"
        )):
            with self.assertRaisesRegex(ValueError, "redirect|URL"):
                guard.read_health(requested)

    def test_rejects_matching_sha_from_different_path(self):
        requested = "http://127.0.0.1:3200/api/health"
        with patch.object(guard, "urlopen", return_value=FakeResponse(
            "http://127.0.0.1:3200/health-mirror"
        )):
            with self.assertRaisesRegex(ValueError, "redirect|URL"):
                guard.read_health(requested)

    def test_never_follows_http_redirect(self):
        visits = {"redirect": 0, "destination": 0}
        redirect_code = {"value": 302}

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path == "/api/health":
                    visits["redirect"] += 1
                    self.send_response(redirect_code["value"])
                    self.send_header("Location", "/forged-health")
                    self.end_headers()
                else:
                    visits["destination"] += 1
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(JSON_BODY)

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            for status in (301, 302, 303, 307, 308):
                with self.subTest(status=status):
                    redirect_code["value"] = status
                    with self.assertRaisesRegex(ValueError, "redirect|URL"):
                        guard.read_health(
                            f"http://127.0.0.1:{server.server_port}/api/health"
                        )
                    self.assertEqual(visits["destination"], 0)
            self.assertEqual(visits["redirect"], 5)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_direct_health_response_still_passes(self):
        request = "http://127.0.0.1:3200/api/health"
        with patch.object(guard, "urlopen", return_value=FakeResponse(request)):
            self.assertEqual(guard.read_health(request)["buildSha"], GOOD)

    def test_required_ci_unit_check_executes_python_guard_suite(self):
        workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        unit_start = workflow.index("\n  unit:\n")
        unit_end = workflow.index("\n  architecture:\n", unit_start)
        unit_job = workflow[unit_start:unit_end]
        self.assertIn("python3 -m unittest discover -s tests", unit_job)
        self.assertIn("test_staging_*.py", unit_job)


if __name__ == "__main__":
    unittest.main()
