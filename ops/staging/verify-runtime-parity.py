#!/usr/bin/env python3
"""Fail closed on staging release/config drift and unavailable public UI.

This tool reads only version identifiers and container status. It NEVER prints
environment files, credentials, provider responses, or raw Docker inspect data.
Its success is a parity preflight, NOT full AUDIT_VERDICT=APTO certification.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

WEB = "solange-client-demo-web"
WORKERS = ("solange-document-worker", "solange-messaging-worker",
           "solange-recurring-payables-worker")
RECONCILER = "solange-demo-reconciler"
TUNNEL = "solange-demo-tunnel"
CONTAINERS = (WEB, *WORKERS, RECONCILER, TUNNEL)
REQUIRED_SHA_KEYS = ("APP_BUILD_SHA", "STAGING_COMMIT_SHA")
SHA_PATTERN = re.compile(r"[a-f0-9]{40}")
PUBLIC_HOST_PATTERN = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com")
LOCAL_HEALTH_URL = "http://127.0.0.1:3200/api/health"


class AuditResult:
    def __init__(self, details: list[str], passed: list[str]):
        self.details = sorted(set(details))
        self.passed = sorted(set(passed))
        self.ok = not self.details

    def __repr__(self) -> str:
        return f"AuditResult(ok={self.ok}, details={self.details}, passed={self.passed})"


def docker_state(name: str) -> tuple[str, str]:
    """Return only process state and restart policy (never Docker .Config.Env)."""
    p = subprocess.run(
        ["docker", "inspect", "--format",
         "{{.State.Status}}|{{.HostConfig.RestartPolicy.Name}}", name],
        capture_output=True, check=False, timeout=10,
    )
    if p.returncode:
        raise RuntimeError("container unavailable")
    state = p.stdout.decode("utf-8", errors="replace").strip().split("|")
    if len(state) != 2:
        raise RuntimeError("container state malformed")
    return state[0], state[1]


def docker_env_value(container: str, key: str) -> str:
    """Read exactly one allowlisted non-secret SHA field from a container."""
    if container not in (WEB, *WORKERS) or key not in REQUIRED_SHA_KEYS:
        raise ValueError("non-allowlisted environment field")
    p = subprocess.run(
        ["docker", "exec", container, "printenv", key],
        capture_output=True, check=False, timeout=8,
    )
    if p.returncode:
        raise RuntimeError("SHA environment identity unavailable")
    value = p.stdout.decode("ascii", errors="replace").strip()
    return value


class _ForbidHealthRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        # Never fetch a redirected URL, even if its release metadata looks valid.
        raise ValueError("health redirect forbidden")


def urlopen(request: Request, timeout: float):
    """Use normal TLS validation but disable automatic HTTP redirects."""
    return build_opener(_ForbidHealthRedirects()).open(request, timeout=timeout)


def read_health(url: str) -> dict:
    """TLS, DNS, HTTP and JSON are all required. Never expose response bodies."""
    request = Request(url, headers={"User-Agent": "SolangeRuntimeParityV1/1"})
    with urlopen(request, timeout=10) as response:
        if response.geturl() != url:
            raise ValueError("health final URL differs from requested endpoint")
        if response.status != 200:
            raise RuntimeError("health returned non-200")
        data = response.read(16385)
    if len(data) > 16384:
        raise ValueError("oversized health response")
    # JSON permits repeated object keys syntactically, but Python's default
    # decoder silently keeps the last value. Never certify ambiguous identity.
    def unique_pairs(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                raise ValueError("duplicate health JSON property")
            value[key] = item
        return value

    value = json.loads(data, object_pairs_hook=unique_pairs)
    if not isinstance(value, dict):
        raise ValueError("invalid health response")
    return value


def expected_identifiers(root: Path, relative: str) -> dict[str, str]:
    path = root / relative
    if not path.is_file():
        raise FileNotFoundError("environment identity file missing")
    identities = {}
    # Only allowlisted SHA names. Never log file lines or other variable values.
    for line in path.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        key = key.strip()
        if separator and key in REQUIRED_SHA_KEYS:
            if key in identities:
                raise ValueError("duplicate release identity key")
            identities[key] = value.strip().strip('"').strip("'")
    return identities


def safe_public_url(root: Path) -> str:
    path = root / "state/current-url.txt"
    if not path.is_file():
        raise FileNotFoundError("public URL marker missing")
    url = path.read_text(encoding="utf-8").strip()
    if len(url) > 256 or any(c.isspace() for c in url):
        raise ValueError("URL malformed")
    parts = urlsplit(url)
    if (parts.scheme != "https" or parts.username is not None
            or parts.password is not None or parts.port not in (None, 443)
            or parts.path not in ("", "/") or parts.query or parts.fragment
            or not parts.hostname or not PUBLIC_HOST_PATTERN.fullmatch(parts.hostname)):
        raise ValueError("public host must be verified HTTPS quick tunnel")
    return url.rstrip("/")


def verify_health(payload: dict, expected: str) -> tuple[bool, bool]:
    metadata_ok = payload.get("status") == "ok" and payload.get("environment") == "staging"
    release_ok = payload.get("buildSha") == expected
    return metadata_ok, release_ok


def audit(root: Path, candidate: str, require_public: bool) -> AuditResult:
    details: list[str] = []
    passed: list[str] = []
    if not SHA_PATTERN.fullmatch(candidate):
        return AuditResult(["candidate_sha_invalid"], passed)

    try:
        deployed = (root / "state/deployed-sha.txt").read_text(encoding="ascii").strip()
        if deployed != candidate:
            details.append("state_release_mismatch")
    except (OSError, UnicodeError):
        details.append("state_release_missing")

    for relative, prefix in (
        ("staging.env", "staging_env"),
        ("app/.env.production.local", "app_env"),
    ):
        try:
            identities = expected_identifiers(root, relative)
            if any(identities.get(k) != candidate for k in REQUIRED_SHA_KEYS):
                details.append(prefix + "_mismatch")
        except (OSError, UnicodeError, ValueError):
            details.append(prefix + "_missing")

    for name in CONTAINERS:
        try:
            state, policy = docker_state(name)
            if state != "running":
                details.append("container_not_running")
            if policy != "unless-stopped":
                details.append("restart_policy_mismatch")
        except (OSError, RuntimeError, subprocess.TimeoutExpired):
            details.append("container_not_running")
            continue
        if name in (WEB, *WORKERS) and state == "running":
            for key in REQUIRED_SHA_KEYS:
                try:
                    observed = docker_env_value(name, key)
                    if observed != candidate:
                        details.append("web_sha_mismatch" if name == WEB else "worker_sha_mismatch")
                except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired):
                    details.append("web_sha_missing" if name == WEB else "worker_sha_missing")

    try:
        payload = read_health(LOCAL_HEALTH_URL)
        metadata_ok, release_ok = verify_health(payload, candidate)
        if not metadata_ok:
            details.append("local_health_invalid")
        if not release_ok:
            details.append("local_health_wrong_release")
        if metadata_ok and release_ok:
            passed.append("local_health")
    except (OSError, RuntimeError, ValueError, TimeoutError, json.JSONDecodeError):
        details.append("local_health_unavailable")

    if require_public:
        try:
            public = safe_public_url(root)
        except FileNotFoundError:
            details.append("public_url_missing")
        except (ValueError, OSError):
            details.append("public_url_invalid")
        else:
            try:
                payload = read_health(public + "/api/health")
                metadata_ok, release_ok = verify_health(payload, candidate)
                if not metadata_ok:
                    details.append("public_health_invalid")
                if not release_ok:
                    details.append("public_health_wrong_release")
                if metadata_ok and release_ok:
                    passed.append("public_health")
            except (OSError, RuntimeError, ValueError, TimeoutError, json.JSONDecodeError):
                details.append("public_health_unavailable")
    else:
        passed.append("public_NOT_VALIDATED")

    if not details:
        passed.append("provenance")
    return AuditResult(details, passed)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--require-public", action="store_true")
    parser.add_argument("--retries", type=int, default=1)
    parser.add_argument("--delay", type=float, default=5)
    args = parser.parse_args()
    if not 1 <= args.retries <= 15 or not 0 <= args.delay <= 10:
        print("STAGING_RUNTIME_PARITY=FAIL reason=invalid_retry_parameters", file=sys.stderr)
        return 2
    result = AuditResult(["not_run"], [])
    for attempt in range(1, args.retries + 1):
        result = audit(args.root, args.expected_sha, args.require_public)
        if result.ok:
            print(
                "STAGING_RUNTIME_PARITY=PASS "
                f"validated={','.join(result.passed)} "
                "AUDIT_VERDICT=NOT_CERTIFIED"
            )
            return 0
        if attempt < args.retries:
            time.sleep(args.delay)
    print(
        "STAGING_RUNTIME_PARITY=FAIL "
        f"failure_codes={','.join(result.details)} "
        "AUDIT_VERDICT=NAO_APTO",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
