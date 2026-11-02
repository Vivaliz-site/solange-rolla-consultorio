import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const loadYaml = (require('js-yaml') as { load: (content: string) => unknown }).load
const workflowsDir = fileURLToPath(new URL('../../.github/workflows/', import.meta.url))
const runnerLabels = ['self-hosted', 'Linux', 'ARM64', 'solange-ci'] as const
const runnerLine = `runs-on: [${runnerLabels.join(', ')}]`
// Stateful staging workflows that read or mutate persisted homologation state must land
// on the dedicated host rather than any runner carrying only the shared `solange-ci` label.
const runnerLineExceptions: Record<string, string> = {
  'staging-promote.yml': `runs-on: [${[...runnerLabels, 'solange-staging-host'].join(', ')}]`,
  'diag-staging-host.yml': `runs-on: [${[...runnerLabels, 'solange-staging-host'].join(', ')}]`,
  'historical-state-audit.yml': `runs-on: [${[...runnerLabels, 'solange-staging-host'].join(', ')}]`,
  'staging-managed-backup-evidence.yml': `runs-on: [${[...runnerLabels, 'solange-staging-host'].join(', ')}]`,
}
const sameRepoGuard = 'github.event.pull_request.head.repo.full_name == github.repository'
type PullRequestEvent = 'pull_request' | 'pull_request_target'

function workflows(): Array<{ name: string; content: string }> {
  return readdirSync(workflowsDir)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => ({
      name,
      content: readFileSync(path.join(workflowsDir, name), 'utf8'),
    }))
}

function parsedWorkflow(content: string): Record<string, unknown> | undefined {
  const parsed = loadYaml(content)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  return parsed as Record<string, unknown>
}

function isSolangeRunner(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    (value.length === runnerLabels.length ||
      (value.length === runnerLabels.length + 1 && value[runnerLabels.length] === 'solange-staging-host')) &&
    runnerLabels.every((label, index) => value[index] === label)
  )
}

function runnerJobs(content: string): Array<{ name: string; block: string; condition: string }> {
  const parsed = parsedWorkflow(content)
  const jobs = parsed?.jobs
  if (!jobs || typeof jobs !== 'object' || Array.isArray(jobs)) return []

  return Object.entries(jobs as Record<string, unknown>).flatMap(([name, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const job = value as Record<string, unknown>
    if (!isSolangeRunner(job['runs-on'])) return []
    return [
      {
        name,
        block: JSON.stringify(job),
        condition: typeof job.if === 'string' ? job.if : '',
      },
    ]
  })
}

function asPullRequestEvent(value: unknown): PullRequestEvent | undefined {
  if (value === 'pull_request' || value === 'pull_request_target') return value
  return undefined
}

function pullRequestEvents(content: string): PullRequestEvent[] {
  const triggerConfig = parsedWorkflow(content)?.on
  const events = new Set<PullRequestEvent>()

  const scalarEvent = asPullRequestEvent(triggerConfig)
  if (scalarEvent) events.add(scalarEvent)

  if (Array.isArray(triggerConfig)) {
    for (const trigger of triggerConfig) {
      const event = asPullRequestEvent(trigger)
      if (event) events.add(event)
    }
  } else if (triggerConfig && typeof triggerConfig === 'object') {
    for (const trigger of Object.keys(triggerConfig)) {
      const event = asPullRequestEvent(trigger)
      if (event) events.add(event)
    }
  }

  return [...events]
}

function hasPullRequestTrigger(content: string): boolean {
  return pullRequestEvents(content).length > 0
}

function splitTopLevel(expression: string, operator: '&&' | '||'): string[] {
  const parts: string[] = []
  let start = 0
  let parenDepth = 0
  let bracketDepth = 0
  let inString = false

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index]
    if (inString) {
      if (char === "'" && expression[index + 1] === "'") {
        index += 1
        continue
      }
      if (char === "'") inString = false
      continue
    }
    if (char === "'") {
      inString = true
      continue
    }
    if (char === '(') {
      parenDepth += 1
      continue
    }
    if (char === ')') {
      parenDepth -= 1
      continue
    }
    if (char === '[') {
      bracketDepth += 1
      continue
    }
    if (char === ']') {
      bracketDepth -= 1
      continue
    }
    if (parenDepth === 0 && bracketDepth === 0 && expression.startsWith(operator, index)) {
      parts.push(expression.slice(start, index).trim())
      index += operator.length - 1
      start = index + 1
    }
  }
  parts.push(expression.slice(start).trim())
  return parts
}

function stripOuterParens(expression: string): string {
  let current = expression.trim()
  for (;;) {
    if (!current.startsWith('(') || !current.endsWith(')')) return current

    let depth = 0
    let inString = false
    let enclosesWholeExpression = true
    for (let index = 0; index < current.length; index += 1) {
      const char = current[index]
      if (inString) {
        if (char === "'" && current[index + 1] === "'") {
          index += 1
          continue
        }
        if (char === "'") inString = false
        continue
      }
      if (char === "'") {
        inString = true
        continue
      }
      if (char === '(') depth += 1
      if (char === ')') {
        depth -= 1
        if (depth === 0 && index !== current.length - 1) {
          enclosesWholeExpression = false
          break
        }
      }
    }

    if (!enclosesWholeExpression || depth !== 0) return current
    current = current.slice(1, -1).trim()
  }
}

function branchRequiresPositiveSameRepoGuard(expression: string): boolean {
  const normalized = stripOuterParens(expression)
  return splitTopLevel(normalized, '&&').some(
    (conjunct) => stripOuterParens(conjunct) === sameRepoGuard,
  )
}

function normalizeCondition(condition: string): string {
  return condition
    .replace(/^\$\{\{\s*/u, '')
    .replace(/\s*\}\}$/u, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function conditionRequiresSameRepoOnEvent(condition: string, eventName: PullRequestEvent): boolean {
  const branches = splitTopLevel(stripOuterParens(normalizeCondition(condition)), '||')
  if (branches.length === 1) return branchRequiresPositiveSameRepoGuard(branches[0] ?? '')
  if (branches.length !== 2) return false
  if (stripOuterParens(branches[0] ?? '') !== `github.event_name != '${eventName}'`) return false
  return branchRequiresPositiveSameRepoGuard(branches[1] ?? '')
}

function conditionRequiresSameRepoOnPullRequest(condition: string): boolean {
  return conditionRequiresSameRepoOnEvent(condition, 'pull_request')
}

describe('GitHub Actions runner policy', () => {
  it('declares the YAML parser used by this mandatory gate as a direct dev dependency', () => {
    const packageJson = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
    ) as { devDependencies?: Record<string, string> }

    expect(packageJson.devDependencies?.['js-yaml']).toBeDefined()
  })

  it('routes all workflow jobs through approved self-hosted Solange runners', () => {
    for (const workflow of workflows()) {
      const runsOnLines = workflow.content.match(/^\s*runs-on:.*$/gmu) ?? []
      const allowed = [runnerLine, runnerLineExceptions[workflow.name]].filter(Boolean)
      for (const line of runsOnLines) {
        expect(allowed, `${workflow.name}: ${line.trim()}`).toContain(line.trim())
      }
    }
  })

  it('keeps the managed backup evidence job on the dedicated staging host and main only', () => {
    const workflow = workflows().find(({ name }) => name === 'staging-managed-backup-evidence.yml')
    expect(workflow).toBeDefined()
    const parsed = parsedWorkflow(workflow?.content ?? '')
    const triggers = parsed?.on as Record<string, unknown> | undefined
    expect(Object.keys(triggers ?? {}).sort()).toEqual(['schedule', 'workflow_dispatch'])
    expect(parsed?.permissions).toEqual({ contents: 'read' })
    const jobs = parsed?.jobs as Record<string, Record<string, unknown>> | undefined
    const verifier = jobs?.['verify-provider-backups']
    expect(verifier?.['runs-on']).toEqual([...runnerLabels, 'solange-staging-host'])
    expect(verifier?.if).toBe("github.ref == 'refs/heads/main'")
    expect(verifier?.environment).toBe('staging')
    expect(workflow?.content).toContain('persist-credentials: false')
  })

  it('guards every pull-request runner job at job level for every PR event', () => {
    for (const workflow of workflows()) {
      const events = pullRequestEvents(workflow.content)
      if (events.length === 0) continue

      for (const job of runnerJobs(workflow.content)) {
        for (const eventName of events) {
          expect(
            conditionRequiresSameRepoOnEvent(job.condition, eventName),
            `${workflow.name}:${job.name}:${eventName}`,
          ).toBe(true)
        }
      }
    }
  })

  it('rejects a same-repository guard that can be bypassed by an OR branch', () => {
    const workflow = [
      'jobs:',
      '  exposed:',
      '    if: ${{ ' + sameRepoGuard + " || github.event_name == 'pull_request' }}",
      `    ${runnerLine}`,
    ].join('\n')
    const [job] = runnerJobs(workflow)

    expect(conditionRequiresSameRepoOnPullRequest(job?.condition ?? '')).toBe(false)
  })

  it('rejects negated or comparison forms of the same-repository predicate', () => {
    expect(conditionRequiresSameRepoOnPullRequest(`!${sameRepoGuard}`)).toBe(false)
    expect(conditionRequiresSameRepoOnPullRequest(`${sameRepoGuard} == false`)).toBe(false)
    expect(conditionRequiresSameRepoOnPullRequest(`!(${sameRepoGuard})`)).toBe(false)
    expect(conditionRequiresSameRepoOnPullRequest(`(${sameRepoGuard}) == false`)).toBe(false)
  })

  it('rejects false comparisons around compound guarded groups', () => {
    expect(
      conditionRequiresSameRepoOnPullRequest(
        `github.event_name != 'pull_request' || (${sameRepoGuard} && true) == false`,
      ),
    ).toBe(false)
  })

  it('rejects OR bypasses after a backslash inside an expression string', () => {
    expect(conditionRequiresSameRepoOnPullRequest(`${sameRepoGuard} && 'x\\' || true`)).toBe(false)
  })

  it('rejects same-repo guards nested inside index expressions', () => {
    const bypass = `fromJSON('{"false":true,"true":true}')[true && ${sameRepoGuard} && false]`
    expect(conditionRequiresSameRepoOnPullRequest(bypass)).toBe(false)
  })

  it('also enforces the PR trust boundary for jobs on the dedicated staging runner', () => {
    const workflow = [
      'on: pull_request_target',
      'jobs:',
      '  exposed:',
      `    runs-on: [${[...runnerLabels, 'solange-staging-host'].join(', ')}]`,
    ].join('\n')
    const [job] = runnerJobs(workflow)
    expect(job?.name).toBe('exposed')
    expect(conditionRequiresSameRepoOnEvent(job?.condition ?? '', 'pull_request_target')).toBe(false)
  })

  it('recognizes inline and quoted pull-request trigger syntax', () => {
    expect(hasPullRequestTrigger('on: [push, pull_request]\n')).toBe(true)
    expect(hasPullRequestTrigger('"on":\n  "pull_request":\n')).toBe(true)
    expect(hasPullRequestTrigger("'on':\n  - 'pull_request'\n")).toBe(true)
    expect(hasPullRequestTrigger('on: {pull_request: {}, push: {}}\n')).toBe(true)
  })

  it('recognizes commented pull-request trigger syntax', () => {
    expect(hasPullRequestTrigger('on: pull_request # PR checks\n')).toBe(true)
    expect(hasPullRequestTrigger('on:\n  - pull_request # PR checks\n')).toBe(true)
  })

  it('recognizes multiline flow collections regardless of entry indentation', () => {
    expect(hasPullRequestTrigger('on: {\n  pull_request: {},\n  push: {}\n}\n')).toBe(true)
    expect(hasPullRequestTrigger('on: {\npull_request: {},\npush: {}\n}\n')).toBe(true)
    expect(hasPullRequestTrigger('on: [\npull_request,\npush\n]\n')).toBe(true)
  })

  it('recognizes block triggers with arbitrary indentation and key separation', () => {
    expect(hasPullRequestTrigger('on:\n    pull_request:\n')).toBe(true)
    expect(hasPullRequestTrigger('on :\n  pull_request:\n')).toBe(true)
    expect(hasPullRequestTrigger('on:\n  push:\n    branches:\n      - pull_request\n')).toBe(false)
  })

  it('recognizes pull-request triggers after multiline quoted flow values', () => {
    const workflow = [
      'on: {',
      'push: {branches: ["main\\',
      '}}}"]},',
      'pull_request: {}',
      '}',
    ].join('\n')

    expect(hasPullRequestTrigger(workflow)).toBe(true)
  })

  it('decodes escaped YAML trigger keys', () => {
    expect(hasPullRequestTrigger('on:\n  "pull\\u005frequest": {}\n')).toBe(true)
  })

  it('resolves YAML aliases used as trigger names', () => {
    const workflow = ['concurrency:', '  group: &pr-event pull_request', 'on: [*pr-event]'].join('\n')

    expect(hasPullRequestTrigger(workflow)).toBe(true)
  })

  it('requires the matching event exemption for pull_request_target', () => {
    const pullRequestExemption = `github.event_name != 'pull_request' || ${sameRepoGuard}`
    const targetExemption = `github.event_name != 'pull_request_target' || ${sameRepoGuard}`

    expect(conditionRequiresSameRepoOnEvent(pullRequestExemption, 'pull_request')).toBe(true)
    expect(conditionRequiresSameRepoOnEvent(pullRequestExemption, 'pull_request_target')).toBe(false)
    expect(conditionRequiresSameRepoOnEvent(targetExemption, 'pull_request_target')).toBe(true)
    expect(conditionRequiresSameRepoOnEvent(targetExemption, 'pull_request')).toBe(false)
    expect(conditionRequiresSameRepoOnEvent(sameRepoGuard, 'pull_request_target')).toBe(true)
  })

  it('decodes YAML job conditions before validating expression guards', () => {
    const workflow = [
      'jobs:',
      '  exposed:',
      `    if: "true \\u007c\\u007c false && ${sameRepoGuard} && true"`,
      `    ${runnerLine}`,
    ].join('\n')
    const [job] = runnerJobs(workflow)

    expect(job?.condition).toContain('true || false')
    expect(conditionRequiresSameRepoOnPullRequest(job?.condition ?? '')).toBe(false)
  })

  it('guards pull_request_target workflows as fork-controlled PR events', () => {
    expect(pullRequestEvents('on: pull_request_target\n')).toEqual(['pull_request_target'])
  })

  it('accepts a folded job-level runner guard', () => {
    const workflow = [
      'jobs:',
      '  guarded:',
      '    if: >-',
      "      github.event_name != 'pull_request' ||",
      `      ${sameRepoGuard}`,
      `    ${runnerLine}`,
    ].join('\n')
    const [job] = runnerJobs(workflow)

    expect(job?.condition).toContain(sameRepoGuard)
  })

  it('does not let duplicate guards in one job cover an unguarded runner job', () => {
    const workflow = [
      'jobs:',
      '  guarded:',
      '    if: ${{ ' + sameRepoGuard + ' && ' + sameRepoGuard + ' }}',
      `    ${runnerLine}`,
      '  exposed:',
      `    ${runnerLine}`,
    ].join('\n')
    const jobs = runnerJobs(workflow)

    expect(jobs).toHaveLength(2)
    expect(jobs[0]?.condition).toContain(sameRepoGuard)
    expect(jobs[1]?.condition).not.toContain(sameRepoGuard)
  })

  it('does not accept a step-level guard as a job-level runner guard', () => {
    const workflow = [
      'jobs:',
      '  exposed:',
      `    ${runnerLine}`,
      '    steps:',
      '      - if: ${{ ' + sameRepoGuard + ' }}',
      '        run: echo guarded-step',
    ].join('\n')
    const [job] = runnerJobs(workflow)

    expect(job?.block).toContain(sameRepoGuard)
    expect(job?.condition).not.toContain(sameRepoGuard)
  })
})
