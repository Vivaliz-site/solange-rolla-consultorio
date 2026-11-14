import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflowDir = '.github/workflows'
const workflowPaths = readdirSync(workflowDir)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .map((name) => join(workflowDir, name))

describe('GitHub Actions npm cache isolation', () => {
  it('isolates every setup-node npm cache restore per self-hosted runner', () => {
    const failures: string[] = []
    let cachedSetupNodeCount = 0

    for (const path of workflowPaths) {
      const source = readFileSync(path, 'utf8')
      if (!source.includes('cache: npm')) continue

      const setupNeedle = 'uses: actions/setup-node@v7'
      let cursor = 0
      while (true) {
        const setupIndex = source.indexOf(setupNeedle, cursor)
        if (setupIndex === -1) break
        const blockStart = Math.max(0, setupIndex - 260)
        const prefix = source.slice(blockStart, setupIndex)
        cachedSetupNodeCount += 1
        if (!prefix.includes('NPM_CONFIG_CACHE=$RUNNER_TEMP/npm-cache')) {
          failures.push(`${path}:${source.slice(0, setupIndex).split('\n').length}`)
        }
        cursor = setupIndex + setupNeedle.length
      }
    }

    expect(cachedSetupNodeCount).toBeGreaterThan(0)
    expect(failures).toEqual([])
  })
})
