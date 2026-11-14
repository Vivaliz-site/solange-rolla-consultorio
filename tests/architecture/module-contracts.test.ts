import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()
const checker = path.join(repositoryRoot, 'scripts/check-module-contracts.mjs')
const fixturesRoot = path.join(
  repositoryRoot,
  'tests/architecture/module-contracts-fixtures',
)

function checkModules(fixture?: string) {
  const args = [checker]

  if (fixture) {
    args.push(
      '--modules-root',
      path.join(fixturesRoot, fixture, 'modules'),
      '--project',
      path.join(fixturesRoot, fixture, 'tsconfig.json'),
    )
  }

  return spawnSync(process.execPath, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
}

function outputOf(result: ReturnType<typeof checkModules>) {
  return `${result.stdout}\n${result.stderr}`
}

describe('module contracts', () => {
  it('accepts the current empty module catalog', () => {
    const result = checkModules()

    expect(result.status, outputOf(result)).toBe(0)
  }, 30_000)

  it('rejects a module without README.md', () => {
    const result = checkModules('missing-readme')

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain('alpha: missing README.md')
  }, 30_000)

  it('rejects a README.md without every required section', () => {
    const result = checkModules('missing-section')

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      'alpha: README.md is missing required section "Proibições"',
    )
  }, 30_000)

  it('rejects a relative cross-module import of an internal file', () => {
    const result = checkModules('relative-internal-import')

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      'consumer: imports producer internal file "producer/internal.ts"',
    )
  }, 30_000)

  it('rejects an aliased cross-module import of an internal file', () => {
    const result = checkModules('alias-internal-import')

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      'consumer: imports producer internal file "producer/internal.ts"',
    )
  }, 30_000)

  it('requires public.ts when another module consumes an exported contract', () => {
    const result = checkModules('missing-public-contract')

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      'producer: cross-module contract requires public.ts',
    )
  }, 30_000)

  it('accepts cross-module imports that resolve exactly to public.ts', () => {
    const result = checkModules('valid-public-contract')

    expect(result.status, outputOf(result)).toBe(0)
  }, 30_000)

  it('fails closed for an unresolved cross-module alias', () => {
    const result = checkModules('unresolved-internal-import')

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      'consumer: unresolved cross-module import "@producer/missing"',
    )
  }, 30_000)

  it('does not count headings inside fenced code blocks', () => {
    const result = checkModules('fenced-section')

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      'alpha: README.md is missing required section "Proibições"',
    )
  }, 30_000)

  it('runs architecture contracts exactly once in the dedicated required gate', () => {
    const workflow = fs.readFileSync(
      path.join(repositoryRoot, '.github/workflows/ci.yml'),
      'utf8',
    )
    const architectureJob = workflow.split(/^  architecture:/mu)[1]?.split(/^  build:/mu)[0]
    const buildJob = workflow.split(/^  build:/mu)[1]?.split(/^  e2e:/mu)[0]

    expect(architectureJob).toBeDefined()
    expect(architectureJob).toContain('run: npm run arch:check')
    expect(architectureJob).toContain('run: npm run modules:check')
    expect(buildJob).toBeDefined()
    expect(buildJob).not.toContain('run: npm run arch:check')
    expect(buildJob).not.toContain('run: npm run modules:check')
  })
})
