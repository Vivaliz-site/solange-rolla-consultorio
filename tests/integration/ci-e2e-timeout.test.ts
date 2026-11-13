import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8')

function e2eJobTimeoutMinutes(source: string): number {
  const normalized = source.replace(/\r\n?/g, '\n')
  const match = normalized.match(/\n  e2e:\n[\s\S]*?\n    timeout-minutes:\s*(\d+)/)
  if (!match) throw new Error('CI_E2E_TIMEOUT_NOT_FOUND')
  return Number(match[1])
}

describe('CI E2E runtime budget', () => {
  it('aceita CRLF sem confundir com a ausência do timeout E2E', () => {
    const fixture = '\n  e2e:\n    runs-on: ubuntu-latest\n    timeout-minutes: 45\n'
    expect(e2eJobTimeoutMinutes(fixture)).toBe(45)
    expect(e2eJobTimeoutMinutes(fixture.replace(/\n/g, '\r\n'))).toBe(45)
  })
  it('keeps enough job time for Supabase reset, production build and the full browser suite', () => {
    expect(e2eJobTimeoutMinutes(workflow)).toBeGreaterThanOrEqual(35)
  })
})
