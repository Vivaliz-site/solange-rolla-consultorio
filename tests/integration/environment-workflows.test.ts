import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const previewScript = path.join(process.cwd(), 'scripts/preview-env.mjs')
const stagingScript = path.join(process.cwd(), 'scripts/staging-lock.mjs')
const stagingWorkflow = path.join(process.cwd(), '.github/workflows/staging-promote.yml')
const historicalAuditWorkflow = path.join(process.cwd(), '.github/workflows/historical-state-audit.yml')
const autoMergeWorkflow = path.join(process.cwd(), '.github/workflows/pr-auto-merge.yml')
const ciWorkflow = path.join(process.cwd(), '.github/workflows/ci.yml')
const backupScript = path.join(process.cwd(), 'scripts/backup-homologation.sh')
const base = {
  SUPABASE_BRANCHING_ENABLED: 'true',
  APP_ENV: 'preview',
  GITHUB_REPOSITORY: 'example/repository',
  GITHUB_EVENT_NUMBER: '12',
  VERCEL_URL: 'preview.example.test',
  SUPABASE_PROJECT_REF: 'preview-ref',
  SUPABASE_PRODUCTION_PROJECT_REF: 'production-ref',
  SUPABASE_STAGING_PROJECT_REF: 'staging-ref',
  WHATSAPP_LIVE_ENABLED: 'false',
  EMAIL_LIVE_ENABLED: 'false',
  NFSE_LIVE_ENABLED: 'false',
}

function run(script: string, environment: Record<string, string>) {
  return execFileSync(process.execPath, [script], {
    env: { ...process.env, ...environment },
    encoding: 'utf8',
  })
}

describe('environment workflow contracts', () => {
  it('automatically promotes staging after canonical main checks without an external kill switch', () => {
    const workflow = readFileSync(stagingWorkflow, 'utf8')
    expect(workflow).not.toContain("vars.STAGING_AUTO_PROMOTE_ENABLED == 'true'")
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'")
  })

  it('requires all canonical checks and deploys the exact main SHA', () => {
    const workflow = readFileSync(stagingWorkflow, 'utf8')
    expect(workflow).toContain('workflows: [CI, Database, Repository Governance Gate, Absolute Audit Main Guard]')
    expect(workflow).toContain('actions: read')
    expect(workflow).toContain('Verify canonical main SHA and checks')
    expect(workflow).toContain('refs/heads/main')
    expect(workflow).toContain("['CI', 'Database', 'Repository Governance Gate', 'Absolute Audit Main Guard']")
    expect(workflow).toContain('Deploy exact SHA to homologation')
    expect(workflow).toContain('APP_BUILD_SHA')
    expect(workflow).toContain('solange-client-demo-web')
    expect(workflow).toContain('ops/document-worker/run-demo-worker.sh')
    expect(workflow).toContain('ops/messaging-worker/run-demo-worker.sh')
    expect(workflow).toContain('ops/recurring-payables-worker/run-demo-worker.sh')
    expect(workflow).toContain('solange-document-worker')
    expect(workflow).toContain('solange-messaging-worker')
    expect(workflow).toContain('solange-recurring-payables-worker')
    expect(workflow).toContain('Verify deployed SHA')
    expect(workflow).toContain('buildSha')
  })

  it('propagates staging project identity into the generated runtime environment', () => {
    const workflow = readFileSync(stagingWorkflow, 'utf8')
    expect(workflow).toContain("SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_STAGING_PROJECT_REF }}")
    expect(workflow).toContain("'SUPABASE_PROJECT_REF': os.environ['SUPABASE_PROJECT_REF']")
    expect(workflow).toContain("'SUPABASE_STAGING_PROJECT_REF': os.environ['SUPABASE_STAGING_PROJECT_REF']")
    expect(workflow).toContain("'SUPABASE_PRODUCTION_PROJECT_REF': os.environ['SUPABASE_PRODUCTION_PROJECT_REF']")
    expect(workflow).toContain('WHATSAPP_LIVE_ENABLED: ${{ vars.WHATSAPP_LIVE_ENABLED }}')
    expect(workflow).not.toContain('WHATSApP_LIVE_ENABLED')
  })

  it('emits a preview association only for a dedicated branch', () => {
    expect(run(previewScript, base)).toContain('"supabasePreviewRef":"preview-ref"')
  })

  it('rejects a preview association pointed at staging', () => {
    expect(() => run(previewScript, { ...base, SUPABASE_PROJECT_REF: 'staging-ref' })).toThrow(
      /dedicated Supabase preview/,
    )
  })

  it('uses the Supabase Management API path for staging migrations', () => {
    const workflow = readFileSync(stagingWorkflow, 'utf8')
    expect(workflow).toContain('SUPABASE_ACCESS_TOKEN')
    expect(workflow).toContain('node scripts/apply-staging-migrations.mjs')
    expect(workflow).not.toContain('SUPABASE_DB_URL')
  })

  it('runs the database security smoke and makes app smoke conditional', () => {
    const workflow = readFileSync(stagingWorkflow, 'utf8')
    expect(workflow).toContain('node scripts/verify-staging-accounting-rls.mjs')
    expect(workflow).toContain("if: vars.STAGING_APP_URL != ''")
    expect(workflow).not.toContain('test -n "$STAGING_APP_URL"')
  })

  it('accepts workflow_dispatch re-validation runs, not only push, as proof a SHA was checked', () => {
    const workflow = readFileSync(stagingWorkflow, 'utf8')
    expect(workflow).toContain("github.event.workflow_run.event == 'push' || github.event.workflow_run.event == 'workflow_dispatch'")
    expect(workflow).toContain("acceptedEvents = ['push', 'workflow_dispatch']")
    expect(workflow).toContain("new URLSearchParams({ head_sha: sha, event, per_page: '100' })")
  })

  it('dispatches exact-SHA post-merge checks without a billed hosted-runner handoff', () => {
    const autoMerge = readFileSync(autoMergeWorkflow, 'utf8')
    expect(autoMerge).toContain('Re-validate merged main at its exact SHA')
    expect(autoMerge).toContain('for workflow in ci.yml db.yml repository-governance.yml')
    expect(autoMerge).toContain('absolute-audit-main-guard.yml')
    expect(autoMerge).not.toContain('staging-handoff:')
    expect(autoMerge).not.toContain('STAGING_HANDOFF_MAX_ATTEMPTS')
    expect(autoMerge).not.toContain('ubuntu-latest')
  })

  it('uses the self-hosted workflow_run promotion gate after each canonical main check', () => {
    const promotion = readFileSync(stagingWorkflow, 'utf8')
    expect(promotion).toContain('workflows: [CI, Database, Repository Governance Gate, Absolute Audit Main Guard]')
    expect(promotion).toContain('types: [completed]')
    expect(promotion).toContain("github.event.workflow_run.conclusion == 'success'")
    expect(promotion).toContain("acceptedEvents = ['push', 'workflow_dispatch']")
    expect(promotion).toContain('canonical checks not green')
    expect(promotion).toContain('promotion not ready:')
    expect(promotion).toContain("if: needs.canonical-gate.outputs.ready == 'true'")
    expect(promotion).toContain('runs-on: [self-hosted, Linux, ARM64, solange-ci]')
    expect(promotion).toContain('cancel-in-progress: false')
  })

  it('cannot occupy the only runner while polling for other canonical checks', () => {
    const autoMerge = readFileSync(autoMergeWorkflow, 'utf8')
    const promotion = readFileSync(stagingWorkflow, 'utf8')
    expect(autoMerge).not.toContain('sleep 15')
    expect(autoMerge).not.toContain('staging-handoff:')
    expect(promotion).toContain("github.event_name == 'workflow_run'")
  })

  it('allocates a runner-local E2E port instead of assuming port 3000 is free', () => {
    const workflow = readFileSync(ciWorkflow, 'utf8')
    const e2eJob = workflow.split('\n  e2e:')[1] ?? ''
    const endToEndStep = e2eJob.split('      - name: End-to-end tests')[1] ?? ''
    expect(endToEndStep).toContain('for attempt in 1 2 3 4 5')
    expect(endToEndStep).toContain('E2E_PORT=')
    expect(endToEndStep).toContain('npm run start -- --hostname 127.0.0.1 --port "$E2E_PORT"')
    expect(endToEndStep).toContain('E2E_REUSE_EXISTING_SERVER=true')
    expect(endToEndStep).toContain('kill -TERM -- "-$E2E_SERVER_PID"')
    expect(endToEndStep).toContain('npm run test:e2e')
  })

  it('builds every worker with the same promoted immutable SHA', () => {
    const workflow = readFileSync(stagingWorkflow, 'utf8')
    expect(workflow).toContain("IMAGE=\"solange-document-worker:$PROMOTE_SHA\"")
    expect(workflow).toContain("IMAGE=\"solange-messaging-worker:$PROMOTE_SHA\"")
    expect(workflow).toContain("IMAGE=\"solange-recurring-payables-worker:$PROMOTE_SHA\"")
  })

  it('runs browser-driven operational homologation against the exact staged SHA before finalizing the release', () => {
    const workflow = readFileSync(stagingWorkflow, 'utf8')
    expect(workflow).toContain('Real UI staging homologation')
    expect(workflow).toContain('E2E_TARGET_ENV')
    expect(workflow).toContain('E2E_ALLOWED_BASE_URL')
    expect(workflow).toContain("'E2E_DB_MODE': 'supabase-management-api'")
    expect(workflow).toContain("'SUPABASE_STAGING_PROJECT_REF': os.environ['SUPABASE_STAGING_PROJECT_REF']")
    expect(workflow).toContain("'SUPABASE_ACCESS_TOKEN': os.environ['SUPABASE_ACCESS_TOKEN']")
    expect(workflow).toContain('E2E_EXPECTED_BUILD_SHA')
    expect(workflow).toContain('tests/e2e/real-ui-homologation.spec.ts')
    expect(workflow).toContain('STAGING_ACCEPTANCE_URL: http://127.0.0.1:3200')
    expect(workflow).not.toContain('state/current-url.txt')
    expect(workflow).toContain('Rollback staging release after failed validation')
    expect(workflow).toContain('Finalize promoted release')
    expect(workflow.indexOf('Real UI staging homologation')).toBeLessThan(workflow.indexOf('Finalize promoted release'))
  })

  it('audits historical UI state transitions against the exact promoted SHA', () => {
    const workflow = readFileSync(historicalAuditWorkflow, 'utf8')
    expect(workflow).toContain('workflows: [Staging Promote]')
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('expected_sha:')
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'")
    expect(workflow).toContain('EXPECTED_SHA_INPUT')
    expect(workflow).toContain('expected_sha: ${{ steps.upstream.outputs.expected_sha }}')
    expect(workflow).toContain('EXPECTED_SHA: ${{ needs.eligibility.outputs.expected_sha }}')
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'")
    expect(workflow).toContain('actions: read')
    expect(workflow).toContain('Verify upstream promotion actually deployed')
    expect(workflow).toContain('promote')
    expect(workflow).toContain("promote?.conclusion === 'success'")
    expect(workflow).toContain('github.event.workflow_run.head_sha')
    expect(workflow).toContain('deployed-sha.txt')
    expect(workflow).toContain("jq -r '.buildSha'")
    expect(workflow).toContain("'E2E_DB_MODE': 'supabase-management-api'")
    expect(workflow).toContain("'E2E_EXTERNAL_SUITE': 'historical-state-audit'")
    expect(workflow).toContain('tests/e2e/agenda-historical-state-transitions.spec.ts')
    expect(workflow).toContain('STAGING_ACCEPTANCE_URL: http://127.0.0.1:3200')
    expect(workflow).not.toContain('state/current-url.txt')
    expect(workflow).toContain("'--workers=1'")
  })

  it('preflights the actual managed staging database before migrations without legacy Docker backup', () => {
    const workflow = readFileSync(stagingWorkflow, 'utf8')
    const backup = readFileSync(backupScript, 'utf8')
    expect(backup).toContain('DEST=${SOLANGE_BACKUP_DEST:-/home/ubuntu/solange-client-demo/backups}')
    expect(backup).not.toContain('/mnt/fredwin-backup')
    expect(backup).toContain('backup_failed: source_identity_mismatch')
    const preflight = workflow.indexOf('Verify managed backup before staging database changes')
    const migration = workflow.indexOf('Apply forward migrations')
    const seed = workflow.indexOf('Seed synthetic staging fixtures')
    const deploy = workflow.indexOf('Deploy exact SHA to homologation')
    expect(preflight).toBeGreaterThan(0)
    expect(preflight).toBeLessThan(migration)
    expect(migration).toBeLessThan(seed)
    expect(seed).toBeLessThan(deploy)
    expect(workflow).toContain('python3 scripts/verify-managed-backup-evidence.py --max-age-seconds 90000')
    expect(workflow).not.toContain('SOLANGE_BACKUP_DEST="$ROOT/backups" scripts/backup-homologation.sh')
    expect(workflow).not.toContain('/home/ubuntu/.local/bin/solange-backup.sh')
    expect(workflow).not.toContain('Refresh durable backup scheduler')
    expect(workflow).not.toContain('ops/backup/run-demo-scheduler.sh')
  })

  it('only removes the recurring worker when this deployment actually promoted its candidate', () => {
    const workflow = readFileSync(stagingWorkflow, 'utf8')
    const deployRollback = workflow.split('          rollback() {')[1]?.split('          cleanup_stage')[0] ?? ''
    const failedValidationRollback = workflow.split('      - name: Rollback staging release after failed validation')[1]?.split('      - name: Finalize promoted release')[0] ?? ''

    expect(workflow).toContain('REC_SWAPPED=0')
    expect(workflow).toContain('docker rename "${REC}-candidate" "$REC"\n          REC_SWAPPED=1')
    expect(deployRollback).toContain('elif [ "$REC_SWAPPED" -eq 1 ]; then')
    expect(deployRollback).not.toMatch(new RegExp('else\\n\\s+docker rm -f "\\$REC"'))

    expect(failedValidationRollback).toContain('[ -f "$TRANSACTION" ] || exit 0')
    expect(failedValidationRollback).toMatch(new RegExp('else\\n\\s+docker rm -f "\\$REC"'))
  })

  it('rolls back only resources created by the current staging transaction', () => {
    const workflow = readFileSync(stagingWorkflow, 'utf8')
    expect(workflow).toContain('TRANSACTION="$ROOT/state/deploy-transaction-$PROMOTE_SHA"')
    expect(workflow).toContain('APP_SWAPPED=0')
    expect(workflow).toContain('WORKERS_SWAPPED=0')
    expect(workflow).toContain('if [ "$APP_SWAPPED" -eq 1 ] && [ -d "$PREVIOUS" ]; then')
    expect(workflow).toContain('[ -f "$TRANSACTION" ] || exit 0')
    expect(workflow).toContain('rm -f "$TRANSACTION"')
    expect(workflow).toContain(`printf '%s\\n' "$PROMOTE_SHA" > "$TRANSACTION"`)
    expect(workflow).toContain('test -f "$STAGE/package.json"')
    expect(workflow).toContain('test -f "$STAGE/.env.production.local"')
    expect(workflow).toContain('test -s "$STAGE/.next/BUILD_ID"')
  })

  it('requires explicit staging approval and distinct project refs', () => {
    expect(
      run(stagingScript, {
        APP_ENV: 'staging',
        STAGING_COMMIT_SHA: 'a'.repeat(40),
        STAGING_PROMOTION_APPROVED: 'true',
        SUPABASE_STAGING_PROJECT_REF: 'staging-ref',
        SUPABASE_PRODUCTION_PROJECT_REF: 'production-ref',
        WHATSAPP_LIVE_ENABLED: 'false',
        EMAIL_LIVE_ENABLED: 'false',
        NFSE_LIVE_ENABLED: 'false',
      }),
    ).toContain('staging promotion authorized')
    expect(() =>
      run(stagingScript, {
        APP_ENV: 'staging',
        STAGING_COMMIT_SHA: 'a'.repeat(40),
        STAGING_PROMOTION_APPROVED: 'false',
        SUPABASE_STAGING_PROJECT_REF: 'staging-ref',
        SUPABASE_PRODUCTION_PROJECT_REF: 'production-ref',
        WHATSAPP_LIVE_ENABLED: 'false',
        EMAIL_LIVE_ENABLED: 'false',
        NFSE_LIVE_ENABLED: 'false',
      }),
    ).toThrow(/requires STAGING_PROMOTION_APPROVED/)
  })
})
