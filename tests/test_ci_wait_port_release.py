"""Local socket-only tests. No Supabase, Docker or remote services."""
from __future__ import annotations

import importlib.util
import io
from contextlib import redirect_stderr
import socket
import threading
import time
import unittest
from pathlib import Path

FILE = Path(__file__).resolve().parents[1] / "scripts" / "ci_wait_port_release.py"
spec = importlib.util.spec_from_file_location("ci_wait_port_release", FILE)
assert spec and spec.loader
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class PortReleaseTests(unittest.TestCase):
    def test_free_port_passes(self):
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()
        self.assertTrue(mod.wait_for_port(port, 0))

    def test_busy_port_fails_closed_without_closing_owner(self):
        with socket.socket() as owner:
            owner.bind(("0.0.0.0", 0))
            owner.listen()
            port = owner.getsockname()[1]
            self.assertFalse(mod.wait_for_port(port, 0.03, poll=0.01))
            self.assertEqual(owner.getsockname()[1], port)

    def test_eventual_release_succeeds(self):
        owner = socket.socket()
        self.addCleanup(owner.close)
        owner.bind(("0.0.0.0", 0))
        owner.listen()
        port = owner.getsockname()[1]
        releaser = threading.Thread(target=lambda: (time.sleep(0.05), owner.close()))
        releaser.start()
        self.assertTrue(mod.wait_for_port(port, 0.5, poll=0.01))
        releaser.join(timeout=1)

    def test_cli_timeout_is_diagnostic(self):
        with socket.socket() as owner:
            owner.bind(("0.0.0.0", 0))
            owner.listen()
            port = owner.getsockname()[1]
            stream = io.StringIO()
            with redirect_stderr(stream):
                self.assertEqual(mod.main([str(port), "--timeout", "0"]), 1)
            self.assertIn("CI_PORT_BUSY", stream.getvalue())

    def test_cli_rejects_privileged_port(self):
        stream = io.StringIO()
        with redirect_stderr(stream), self.assertRaises(SystemExit) as ctx:
            mod.main(["80", "--timeout", "0"])
        self.assertEqual(ctx.exception.code, 2)
        self.assertIn("port must be 1024", stream.getvalue())


if __name__ == "__main__":
    unittest.main()
