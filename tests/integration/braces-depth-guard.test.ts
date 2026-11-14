import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

function probe(patternExpression: string) {
  const script = [
    "const braces = require('braces')",
    `const pattern = ${patternExpression}`,
    "try { braces(pattern); process.stdout.write('OK') } catch (error) { process.stdout.write(error.name + ':' + error.message) }",
  ].join(';')
  return execFileSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 5_000 }).trim()
}

describe('vendored braces recursion hardening', () => {
  it('rejects deeply nested brace patterns before recursive walkers can exhaust the stack', () => {
    expect(probe("'{'.repeat(4400) + 'a,b' + '}'.repeat(4400)")).toBe(
      'SyntaxError:BRACES_MAX_DEPTH_EXCEEDED',
    )
  })

  it('preserves normal brace matching behavior', () => {
    expect(probe("'{a,b}'")).toBe('OK')
  })
})
