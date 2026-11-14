import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const deploy = path.join(root, 'ops/backup/run-demo-scheduler.sh')
const workflow = path.join(root, '.github/workflows/staging-promote.yml')
const diagnostic = path.join(root, '.github/workflows/diag-staging-host.yml')

describe('durable backup scheduler contract', () => {
  it('deploys the scheduler against the persistent VM backup directory with health monitoring', () => {
    const script = readFileSync(deploy, 'utf8')
    expect(script).toContain('solange-backup-scheduler')
    expect(script).toContain('$DEMO/backups:$DEMO/backups')
    expect(script).toContain('SOLANGE_BACKUP_DEST="$DEMO/backups"')
    expect(script).toContain('SOLANGE_BACKUP_MAX_AGE_SECONDS=90000')
    expect(script).toContain('--health-cmd')
    expect(script).toContain('/check-backup-health.sh')
    expect(script).not.toContain('/mnt/fredwin-backup')
  })

  it('diagnoses the canonical persistent backup destination instead of the retired Fred-Win mount', () => {
    const yaml = readFileSync(diagnostic, 'utf8')
    expect(yaml).toContain('/home/ubuntu/solange-client-demo/backups')
    expect(yaml).toContain('solange-backup-scheduler')
    expect(yaml).not.toContain('/mnt/fredwin-backup')
  })

  it('verifies managed Supabase backup provenance before staging migrations without refreshing the legacy scheduler', () => {
    const yaml = readFileSync(workflow, 'utf8')
    const backup = yaml.indexOf('Verify managed backup before staging database changes')
    const migrations = yaml.indexOf('Apply forward migrations')
    const acceptance = yaml.indexOf('Real UI staging homologation')
    const rollback = yaml.indexOf('Rollback staging release after failed validation')

    expect(backup).toBeGreaterThan(-1)
    expect(migrations).toBeGreaterThan(backup)
    expect(acceptance).toBeGreaterThan(migrations)
    expect(rollback).toBeGreaterThan(acceptance)
    expect(yaml).toContain('scripts/verify-managed-backup-evidence.py --max-age-seconds 90000')
    expect(yaml).not.toContain('Refresh durable backup scheduler')
    expect(yaml).not.toContain('bash ops/backup/run-demo-scheduler.sh')
  })
})
