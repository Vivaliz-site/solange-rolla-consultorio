import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { engines?: { node?: string } }
const staging = readFileSync('.github/workflows/staging-promote.yml', 'utf8')
const workerDockerfiles = [
  'ops/document-worker/Dockerfile',
  'ops/messaging-worker/Dockerfile',
  'ops/recurring-payables-worker/Dockerfile',
].map((path) => readFileSync(path, 'utf8'))

describe('Node runtime parity', () => {
  it('pins staging web build/runtime to the exact package Node patch', () => {
    const version = packageJson.engines?.node
    expect(version).toBe('24.19.0')
    expect(staging).toContain('node:24.19.0-bookworm-slim')
    expect(staging).not.toContain('node:24-bookworm-slim')
  })

  it('keeps workers on the same exact Node patch as staging web', () => {
    for (const dockerfile of workerDockerfiles) {
      expect(dockerfile).toContain('node:24.19.0-bookworm-slim')
      expect(dockerfile).not.toContain('node:24-bookworm-slim')
    }
  })

  it('pins both staging build commands and the runtime container', () => {
    expect(staging.match(/node:24\.19\.0-bookworm-slim/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })
})
