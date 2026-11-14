# Secrets and Rotation

This document lists secret names and ownership only. Values belong in the
environment's secret manager, never in Git, issues, PRs, logs or tests.

## Per-environment inventory

| Secret/config | Scope | Purpose | Rotation |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | environment | public project endpoint | when project changes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | environment | browser-safe Supabase key | provider policy or project change |
| `SUPABASE_SECRET_KEY` | server-only environment | privileged workers and server adapters | provider policy; revoke immediately on leak |
| `CLINICAL_ENCRYPTION_KEY_V1` | environment, server-only | L3 envelope encryption | add a new version; retain old versions while envelopes reference them |
| `RATE_LIMIT_HMAC_KEY` | environment, server-only | privacy-safe rate-limit identifiers | coordinated rotation |
| `PUBLIC_ACTION_HMAC_KEY` | environment, server-only | one-time public action token signatures | coordinated rotation; keep distinct from rate-limit key |
| `WHATSAPP_ACCESS_TOKEN` | environment, server-only | Meta WhatsApp Cloud API adapter | provider policy or leak |
| `WHATSAPP_PHONE_NUMBER_ID` | environment, server-only | Meta WhatsApp Cloud API adapter (not secret by itself, but keep alongside the token) | when the sending number changes |
| `WEBHOOK_SIGNING_SECRET_META_WHATSAPP` | environment, server-only | verify Meta `X-Hub-Signature-256` delivery webhooks | provider policy or leak |
| `WEBHOOK_VERIFY_TOKEN_META_WHATSAPP` | environment, server-only | Meta webhook subscription challenge | rotate when webhook subscription changes |
| `EMAIL_SMTP_HOST` / `EMAIL_SMTP_PORT` | environment | SMTP adapter connection | when the provider changes |
| `EMAIL_SMTP_USER` / `EMAIL_SMTP_PASSWORD` | environment, server-only | SMTP adapter credentials | provider policy or leak |
| `EMAIL_FROM` | environment | SMTP adapter sender address (not secret) | when the sending mailbox changes |
| `NFSE_*` credentials | environment, server-only | fiscal sandbox/homologation/live adapter | provider policy or leak |
| `WEBHOOK_SIGNING_SECRET_*` | environment, server-only | inbound provider verification | provider policy or leak |

## Rules

- Every staging value differs from its production counterpart.
- Preview receives only disposable project/branch credentials.
- `SUPABASE_SECRET_KEY`, encryption keys and provider tokens never use a
  `NEXT_PUBLIC_` prefix and are never read by client components.
- Encryption rotation adds `CLINICAL_ENCRYPTION_KEY_V<N>` and changes the
  active version; it does not delete a key still referenced by stored data.
- A suspected leak triggers revocation and rotation first. Removing a value
  from Git does not remediate a compromised credential.
- Production live providers remain disabled until the documented go-live gate.

## External provisioning blocker

Secret-manager entries and rotations require account-owner/provider access not
available in this repository execution. No values were generated or recorded.

## Signed document worker

- The worker reuses `SUPABASE_SECRET_KEY` and `CLINICAL_ENCRYPTION_KEY_V<N>` server-side only.
- `DOCUMENT_WORKER_POLL_MS` and `DOCUMENT_WORKER_BATCH_SIZE` are non-secret runtime tuning values.
- `DOCUMENT_WORKER_HEALTH_FILE` is a local heartbeat path and must not contain payload data.
- Worker env files stay outside Git with mode `0600`; do not pass secret values on command lines or logs.
- The worker may read signed form/template data through `service_role`, but it must not receive form-table write privileges.

## Messaging worker

- The worker reuses `SUPABASE_SECRET_KEY` server-side only, same as every other worker.
- WhatsApp send is disabled unless `WHATSAPP_LIVE_ENABLED=true`; email send is disabled unless `EMAIL_LIVE_ENABLED=true`. Both default to `false` and are gated by the same environment-isolation assertion (`scripts/assert-environment.mjs`) as `NFSE_LIVE_ENABLED`: never on outside production, and production requires `GO_LIVE_APPROVED=true`.
- `MESSAGING_WORKER_POLL_MS` and `MESSAGING_WORKER_BATCH_SIZE` are non-secret runtime tuning values, matching the document worker's `DOCUMENT_WORKER_*` pair.
- `MESSAGING_WORKER_HEALTH_FILE` is a local heartbeat path and must not contain payload data.
- `APPOINTMENT_CONFIRMATION_SCHEDULER_INTERVAL_MS` is a non-secret tuning value (default 120000ms) throttling how often the same worker process checks for appointments 23-25h out and issues their confirmation capability link; it does not need its own queue or deployment, it runs inside the messaging worker's existing poll loop.
- Worker env files stay outside Git with mode `0600`; do not pass secret values on command lines or logs.
- See `docs/CREDENTIALS-ROTATION-BEFORE-PRODUCTION.md` for the temporary Shop Vivaliz SMTP credentials currently used to validate real email delivery, and what must replace them before production go-live.
