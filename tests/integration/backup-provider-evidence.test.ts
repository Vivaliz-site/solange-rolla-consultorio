import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/staging-managed-backup-evidence.yml', 'utf8')
const legacyBackup = readFileSync('scripts/backup-homologation.sh', 'utf8')
const health = readFileSync('scripts/check-backup-health.sh', 'utf8')

describe('staging managed database backup source', () => {
  it('runs hostile-source and managed metadata regressions in CI', () => {
    const result = spawnSync('python3', ['-m', 'unittest',
      'tests.test_managed_backup_evidence', 'tests.test_backup_source_guard'], {
      encoding: 'utf8',
      timeout: 120_000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    })
    expect(result.error, result.stderr || 'python3 execution failed').toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
  }, 120_000)

  it('never accepts local Docker pg_dump as hosted staging recovery', () => {
    expect(legacyBackup).toContain('backup_failed: source_identity_mismatch')
    expect(legacyBackup).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(legacyBackup.indexOf('source_identity_mismatch')).toBeLessThan(
      legacyBackup.indexOf('docker run --rm --network')
    )
  })

  it('requires provenance with checksum and age validation', () => {
    expect(health).toContain('SOURCE_KIND')
    expect(health).toContain('SOURCE_REF')
    expect(health).toContain('managed_supabase')
    expect(health).toContain('backup_unhealthy')
    expect(health).toContain('sha256sum')
  })

  it('audits the managed provider only from main with staging-only secrets', () => {
    expect(workflow).toContain("github.ref == 'refs/heads/main'")
    expect(workflow).toContain('environment: staging')
    expect(workflow).toContain('verify-managed-backup-evidence.py')
    expect(workflow).toContain('secrets.SUPABASE_STAGING_PROJECT_REF')
    expect(workflow).toContain('secrets.SUPABASE_PRODUCTION_PROJECT_REF')
    expect(workflow).toContain('secrets.SUPABASE_ACCESS_TOKEN')
    expect(workflow).not.toContain('pull_request:')
    expect(workflow).not.toContain('contents: write')
  })
})
