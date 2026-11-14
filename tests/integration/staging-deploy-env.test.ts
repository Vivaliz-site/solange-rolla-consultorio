import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/staging-promote.yml', 'utf8')

describe('staging deploy environment', () => {
  it('pins the stateful staging deployment to the dedicated homologation host', () => {
    const promote = workflow.slice(workflow.indexOf('  promote:'), workflow.indexOf('    environment: staging'))
    expect(promote).toContain('runs-on: [self-hosted, Linux, ARM64, solange-ci, solange-staging-host]')
  })

  it('propagates every Supabase project identity into the runtime environment', () => {
    const deploy = workflow.slice(workflow.indexOf('- name: Deploy exact SHA to homologation'))
    expect(deploy).toContain('SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_STAGING_PROJECT_REF }}')
    expect(deploy).toContain('SUPABASE_STAGING_PROJECT_REF: ${{ secrets.SUPABASE_STAGING_PROJECT_REF }}')
    expect(deploy).toContain('SUPABASE_PRODUCTION_PROJECT_REF: ${{ secrets.SUPABASE_PRODUCTION_PROJECT_REF }}')
    expect(deploy).toContain("'SUPABASE_PROJECT_REF': os.environ['SUPABASE_PROJECT_REF']")
    expect(deploy).toContain("'SUPABASE_STAGING_PROJECT_REF': os.environ['SUPABASE_STAGING_PROJECT_REF']")
    expect(deploy).toContain("'SUPABASE_PRODUCTION_PROJECT_REF': os.environ['SUPABASE_PRODUCTION_PROJECT_REF']")
  })

  it('disables TLS only for the loopback homologation database push', () => {
    const deploy = workflow.slice(workflow.indexOf('- name: Deploy exact SHA to homologation'))
    expect(deploy).toContain("hostname in {'127.0.0.1', 'localhost'}")
    expect(deploy).toContain("query['sslmode'] = 'disable'")
  })
})

describe('staging deploy live-channel flags', () => {
  it('uses the canonical WhatsApp environment variable name', () => {
    const deploy = workflow.slice(workflow.indexOf('- name: Deploy exact SHA to homologation'))
    expect(deploy).toContain('WHATSAPP_LIVE_ENABLED: ${{ vars.WHATSAPP_LIVE_ENABLED }}')
    expect(deploy).not.toContain('WHATSApP_LIVE_ENABLED')
  })
})

describe('staging database endpoint readiness', () => {
  it('repairs a missing loopback database publication before migration push', () => {
    const deploy = workflow.slice(workflow.indexOf('- name: Deploy exact SHA to homologation'))
    expect(deploy).toContain('STAGING_DB_CONTAINER=supabase_db_solange-client-demo')
    expect(deploy).toContain('pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER"')
    expect(deploy).toContain('docker restart -t 30 "$STAGING_DB_CONTAINER"')
    expect(deploy).toContain('staging database endpoint unavailable after repair')
  })
})

describe('staging runtime URL and reconciler contract', () => {
  it('uses a stable runner-local URL for staging runtime and acceptance', () => {
    const deploy = workflow.slice(workflow.indexOf('- name: Deploy exact SHA to homologation'))
    expect(workflow).toContain('STAGING_ACCEPTANCE_URL: http://127.0.0.1:3200')
    expect(deploy).toContain("'APP_URL': app_url")
    expect(deploy).not.toContain('"$ROOT/state/current-url.txt"')
    expect(deploy).toContain('URL="$STAGING_ACCEPTANCE_URL"')
  })

  it('normalizes web, tunnel, and reconciler restart policies before the app swap', () => {
    const deploy = workflow.slice(workflow.indexOf('- name: Deploy exact SHA to homologation'))
    expect(deploy).toContain('RECONCILER=solange-demo-reconciler')
    expect(deploy).toContain('TUNNEL=solange-demo-tunnel')
    expect(deploy).toContain('docker update --restart unless-stopped "$RECONCILER" "$TUNNEL"')
    expect(deploy).toContain('docker run -d --name "$WEB" --restart unless-stopped')
    expect(deploy).toContain('docker restart "$RECONCILER"')
    expect(deploy).toContain('docker inspect -f \'{{.HostConfig.RestartPolicy.Name}}\' solange-demo-reconciler')
    expect(deploy).toContain('docker inspect -f \'{{.HostConfig.RestartPolicy.Name}}\' solange-demo-tunnel')
  })

  it('uses the versioned reconciler instead of the legacy host preflight', () => {
    const deploy = workflow.slice(workflow.indexOf('- name: Deploy exact SHA to homologation'))
    expect(deploy).toContain('ops/staging/reconcile-demo.sh')
    expect(deploy).not.toContain('"$ROOT/preflight.sh"')
  })
})

describe('staging reconciler transactional rollback', () => {
  it('backs up and restores the reconciler script with the release transaction', () => {
    const deploy = workflow.slice(workflow.indexOf('- name: Deploy exact SHA to homologation'))
    expect(deploy).toContain('RECONCILER_PREVIOUS="$ROOT/reconcile-previous.sh"')
    expect(deploy).toContain('cp -p "$ROOT/reconcile.sh" "$RECONCILER_PREVIOUS"')
    expect(deploy).toContain('mv "$RECONCILER_PREVIOUS" "$ROOT/reconcile.sh"')
    expect(deploy).toContain('rm -f "$ROOT/reconcile-previous.sh"')
  })
})

describe('staging cloud homologation data contract', () => {
  it('seeds and verifies the same dedicated cloud staging project used by the browser', () => {
    const deploy = workflow.slice(workflow.indexOf('- name: Deploy exact SHA to homologation'))
    expect(workflow).toContain('Seed synthetic staging fixtures')
    expect(workflow).toContain('node scripts/seed-staging-project.mjs')
    expect(deploy).toContain("'E2E_DB_MODE': 'supabase-management-api'")
    expect(deploy).toContain("'SUPABASE_STAGING_PROJECT_REF': os.environ['SUPABASE_STAGING_PROJECT_REF']")
    expect(deploy).toContain("'SUPABASE_ACCESS_TOKEN': os.environ['SUPABASE_ACCESS_TOKEN']")
    expect(deploy).not.toContain("'E2E_ALLOWED_DB_URL': values['DB_URL']")
  })
})

describe('staging exact-release runtime parity self-tests', () => {
  it('executes adversarial runtime parity and public release regressions in CI', () => {
    const result = spawnSync('python3', ['-m', 'unittest', 'tests.test_staging_runtime_parity'], {
      encoding: 'utf8',
      timeout: 120_000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    })
    expect(result.error, result.stderr || 'python3 execution failed').toBeUndefined()
    expect(result.status, [result.stdout, result.stderr].join('\n')).toBe(0)
  }, 120_000)

  it('runs synthetic env snapshot/rollback/finalize fault-injection regressions in CI', () => {
    const result = spawnSync('python3', ['-m', 'unittest', 'tests.test_staging_env_transaction'], {
      encoding: 'utf8',
      timeout: 120_000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    })
    expect(result.error, result.stderr || 'python3 execution failed').toBeUndefined()
    expect(result.status, [result.stdout, result.stderr].join('\n')).toBe(0)
  }, 120_000)
})
