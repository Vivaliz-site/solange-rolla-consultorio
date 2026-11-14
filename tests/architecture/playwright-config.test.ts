import { afterEach, describe, expect, it, vi } from 'vitest'

const originalCI = process.env.CI

afterEach(() => {
  if (originalCI === undefined) delete process.env.CI
  else process.env.CI = originalCI
  vi.resetModules()
})

describe('playwright config', () => {
  it('retries flaky specs in CI (single worker, shared self-hosted runner) but not locally', async () => {
    vi.resetModules()
    process.env.CI = 'true'
    const { default: ciConfig } = await import('../../playwright.config')
    expect(ciConfig.retries).toBeGreaterThanOrEqual(1)

    vi.resetModules()
    delete process.env.CI
    const { default: localConfig } = await import('../../playwright.config')
    expect(localConfig.retries ?? 0).toBe(0)
  }, 15_000)
})
