import { mkdtempSync, readFileSync, writeFileSync, utimesSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { rmSync } from 'node:fs'

const roots: string[] = []
function fixture(ageSeconds = 0) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'backup-health-'))
  roots.push(root)
  const full = 'solange-homologacao-fixture.dump'
  const subset = 'solange-homologacao-app-auth-fixture.dump'
  for (const [name, body] of [[full, 'full-backup'], [subset, 'subset-backup']] as const) {
    const file = path.join(root, name)
    writeFileSync(file, body)
    const digest = createHash('sha256').update(body).digest('hex')
    writeFileSync(`${file}.sha256`, `${digest}  ${file}\n`)
  }
  writeFileSync(path.join(root, 'LAST_SUCCESS'), `2026-09-16T00:00:00Z source_kind=managed_supabase source_ref=abcdefghijklmnopqrst full=${full} restore_subset=${subset}\n`)
  const when = new Date(Date.now() - ageSeconds * 1000)
  utimesSync(path.join(root, 'LAST_SUCCESS'), when, when)
  return { root, full, subset }
}
function check(root: string, maxAge = 90000) {
  return spawnSync('sh', ['scripts/check-backup-health.sh'], {
    cwd: process.cwd(), encoding: 'utf8',
    env: { ...process.env, SOLANGE_BACKUP_DEST: root, SOLANGE_BACKUP_MAX_AGE_SECONDS: String(maxAge), SOLANGE_BACKUP_EXPECTED_PROJECT_REF: 'abcdefghijklmnopqrst' },
  })
}
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }) })

describe('backup health contract', () => {
  it('accepts a fresh backup only when both dump checksums are valid', () => {
    const { root } = fixture()
    const result = check(root)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('backup_healthy')
  })
  it('rejects a stale LAST_SUCCESS marker', () => {
    const { root } = fixture(200)
    const result = check(root, 60)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('backup_unhealthy: stale')
  })
  it('rejects checksum drift in either protected dump', () => {
    const { root, subset } = fixture()
    writeFileSync(path.join(root, subset), 'tampered')
    const result = check(root)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('backup_unhealthy: checksum')
  })

  it('rejects local legacy backup metadata even with valid files', () => {
    const { root } = fixture()
    const record = path.join(root, 'LAST_SUCCESS')
    writeFileSync(record, readFileSync(record, 'utf8').replace(
      'source_kind=managed_supabase', 'source_kind=local_docker'
    ))
    const result = check(root)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('backup_unhealthy: source_provenance')
  })

  it('rejects backup metadata from a foreign Supabase project', () => {
    const { root } = fixture()
    const record = path.join(root, 'LAST_SUCCESS')
    writeFileSync(record, readFileSync(record, 'utf8').replace(
      'source_ref=abcdefghijklmnopqrst', 'source_ref=zyxwvutsrqponmlkjihg'
    ))
    const result = check(root)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('backup_unhealthy: source_provenance')
  })
})
