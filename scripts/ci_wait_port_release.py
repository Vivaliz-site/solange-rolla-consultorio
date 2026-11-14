#!/usr/bin/env python3
"""Wait for Docker to release local CI ports without killing another owner."""
from __future__ import annotations

import argparse
import socket
import sys
import time


def port_is_free(port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.bind(("0.0.0.0", port))
        return True
    except OSError:
        return False


def wait_for_port(port: int, timeout: float, poll: float = 1.0) -> bool:
    deadline = time.monotonic() + timeout
    while True:
        if port_is_free(port):
            return True
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False
        time.sleep(min(poll, remaining))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("port", type=int)
    parser.add_argument("--timeout", type=float, default=120.0)
    args = parser.parse_args(argv)
    if not 1024 <= args.port <= 65535 or not 0 <= args.timeout <= 300:
        parser.error("port must be 1024..65535 and timeout 0..300 seconds")
    if wait_for_port(args.port, args.timeout):
        print(f"CI_PORT_RELEASED port={args.port}")
        return 0
    print(f"::error::CI_PORT_BUSY port={args.port} (timeout; owner preserved)", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
