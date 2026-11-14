import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8')

function lintJobTimeoutMinutes(source: string): number {
  const match = source.match(/\n  lint:\n[\s\S]*?\n    timeout-minutes:\s*(\d+)/)
  if (!match) throw new Error('CI_LINT_TIMEOUT_NOT_FOUND')
  return Number(match[1])
}

describe('CI lint runtime budget', () => {
  it('allows the full ESLint suite to complete on a contended self-hosted runner', () => {
    // The main CI run #1202 was cancelled at its former 10-minute job timeout.
    expect(lintJobTimeoutMinutes(workflow)).toBeGreaterThanOrEqual(20)
  })
})
