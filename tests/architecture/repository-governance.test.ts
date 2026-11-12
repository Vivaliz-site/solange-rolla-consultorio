import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requiredRunnerLabels = ['self-hosted', 'Linux', 'ARM64', 'solange-ci']
// Stateful staging workflows are pinned when they need access to persisted homologation state.
const runnerLabelExceptionsByFile: Record<string, string[][]> = {
  'staging-promote.yml': [requiredRunnerLabels, [...requiredRunnerLabels, 'solange-staging-host']],
  'diag-staging-host.yml': [[...requiredRunnerLabels, 'solange-staging-host']],
  'historical-state-audit.yml': [[...requiredRunnerLabels, 'solange-staging-host'], [...requiredRunnerLabels, 'solange-staging-host']],
  'staging-managed-backup-evidence.yml': [
    [...requiredRunnerLabels, 'solange-staging-host'],
    [...requiredRunnerLabels, 'solange-staging-host'],
    [...requiredRunnerLabels, 'solange-staging-host'],
  ],
}

function indexMode(path: string): string {
  return execFileSync('git', ['ls-files', '-s', '--', path], {
    cwd: root,
    encoding: 'utf8',
  }).trim().split(/\s+/u)[0]
}

function projectFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8')
}

function cleanYamlScalar(value: string): string {
  return value.trim().replace(/^['"]|['"]$/gu, '')
}

function runsOnLabels(workflow: string): string[][] {
  const lines = workflow.split(/\r?\n/u)
  const declarations: string[][] = []

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)runs-on:\s*(.*)$/u)
    if (!match) continue
    const indent = match[1].length
    const inline = match[2].trim()

    if (inline.startsWith('[') && inline.endsWith(']')) {
      declarations.push(inline.slice(1, -1).split(',').map(cleanYamlScalar))
      continue
    }

    if (inline) {
      declarations.push([cleanYamlScalar(inline)])
      continue
    }

    const labels: string[] = []
    for (let child = index + 1; child < lines.length; child += 1) {
      if (!lines[child].trim()) continue
      const listItem = lines[child].match(/^(\s*)-\s*(.+)$/u)
      if (!listItem || listItem[1].length <= indent) break
      labels.push(cleanYamlScalar(listItem[2]))
    }
    declarations.push(labels)
  }

  return declarations
}

describe('repository governance contract', () => {
  it('keeps versioned Git hooks executable', () => {
    expect(indexMode('.githooks/pre-commit')).toBe('100755')
    expect(indexMode('.githooks/pre-push')).toBe('100755')
  })

  it('invokes the pre-push governance validator through Bash', () => {
    const hook = projectFile('.githooks/pre-push')
    expect(hook).toContain('bash "$root/scripts/repository-governance-validate.sh" pre-push')
  })

  it('parses inline and multiline self-hosted runner declarations', () => {
    const fixture = `jobs:
  inline:
    runs-on: [self-hosted, Linux, ARM64, solange-ci]
  multiline:
    runs-on:
      - self-hosted
      - Linux
      - ARM64
      - solange-ci`

    expect(runsOnLabels(fixture)).toEqual([
      requiredRunnerLabels,
      requiredRunnerLabels,
    ])
  })

  it('routes workflow jobs through the dedicated ARM runner except explicit control-plane jobs', () => {
    const workflowsDir = fileURLToPath(new URL('../../.github/workflows/', import.meta.url))
    const workflows = readdirSync(workflowsDir).filter((name) => name.endsWith('.yml'))

    expect(workflows.length).toBeGreaterThan(0)
    for (const name of workflows) {
      const workflow = readFileSync(workflowsDir + '/' + name, 'utf8')
      const declarations = workflow.match(/^\s*runs-on:/gmu) ?? []
      const parsed = runsOnLabels(workflow)

      expect(parsed).toHaveLength(declarations.length)
      const expected = runnerLabelExceptionsByFile[name]
      parsed.forEach((labels, index) => {
        expect(labels).toEqual(expected?.[index] ?? requiredRunnerLabels)
      })
    }
  })

  it('bootstraps a verified GitHub CLI for self-hosted auto-merge', () => {
    const workflow = projectFile('.github/workflows/pr-auto-merge.yml')

    expect(workflow).toContain('GH_VERSION: 2.98.0')
    expect(workflow).toContain('GH_SHA256: cf689084f3a3618f7eae4a2420d335d74626d65f5e594b9828d125d69f800d86')
    expect(workflow).toContain('sha256sum -c -')
    expect(workflow).toContain('$GITHUB_PATH')
    expect(workflow).not.toContain('command -v gh')
  })

  it('gates auto-merge through complete REST checks and statuses', () => {
    const workflow = projectFile('.github/workflows/pr-auto-merge.yml')

    expect(workflow).toContain('statuses: read')
    expect(workflow).toContain('repos/$REPO/commits/$HEAD_SHA/check-runs?filter=latest&per_page=100')
    expect(workflow).toContain('repos/$REPO/commits/$HEAD_SHA/status')
    expect(workflow).toContain('(.total_count > 0) and')
    expect(workflow).toContain('all(.check_runs[];')
    expect(workflow).toContain('.status == "completed"')
    expect(workflow).toContain('.conclusion == "success"')
    expect(workflow).toContain('.conclusion == "skipped"')
    expect(workflow).toContain('.conclusion == "neutral"')
    expect(workflow).toContain('(.statuses | length == 0) or .state == "success"')
    expect(workflow).not.toContain('gh pr checks')
  })

  it('requires every canonical pull-request workflow before merge', () => {
    const workflow = projectFile('.github/workflows/pr-auto-merge.yml')

    expect(workflow).toContain('repos/$REPO/actions/runs?head_sha=$HEAD_SHA&event=pull_request&per_page=100')
    for (const name of ['CI', 'Database', 'Repository Governance Gate', 'AI Conflict Resolver', 'Preview']) {
      expect(workflow).toContain(`'${name}'`)
    }
    expect(workflow).toContain('all($required[];')
    expect(workflow).toContain('.status == "completed"')
  })

  it('pins auto-merge to the validated main-targeting PR head', () => {
    const workflow = projectFile('.github/workflows/pr-auto-merge.yml')

    expect(workflow).toContain('.base.ref == "main"')
    expect(workflow).toContain('.head.sha == $sha')
    expect(workflow).toContain('repos/$REPO/pulls/$pr_number')
    expect(workflow).toContain('--match-head-commit "$HEAD_SHA"')
  })

  it('retries auto-merge whenever any pull-request gate finishes', () => {
    const workflow = projectFile('.github/workflows/pr-auto-merge.yml')

    expect(workflow).toContain('- CI')
    expect(workflow).toContain('- Database')
    expect(workflow).toContain('- Repository Governance Gate')
    expect(workflow).toContain('- AI Conflict Resolver')
    expect(workflow).toContain('- Preview')
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'skipped'")
  })

  it('re-dispatches canonical checks against the merged main SHA, since GITHUB_TOKEN pushes never fire push events', () => {
    const workflow = projectFile('.github/workflows/pr-auto-merge.yml')

    expect(workflow).toContain('Re-validate merged main at its exact SHA')
    expect(workflow).toContain('repos/$REPO/git/ref/heads/main')
    expect(workflow).toContain('for workflow in ci.yml db.yml repository-governance.yml')
    expect(workflow).toContain('actions/workflows/$workflow/dispatches')
  })

  it('grants the token write access to Actions, since dispatching a workflow requires it', () => {
    const workflow = projectFile('.github/workflows/pr-auto-merge.yml')

    expect(workflow).toContain('actions: write')
    expect(workflow).not.toContain('actions: read')
  })

  it('lets the governance gate be dispatched manually for post-merge re-validation', () => {
    const workflow = projectFile('.github/workflows/repository-governance.yml')

    expect(workflow).toContain('workflow_dispatch:')
  })

  it('runs staging build containers with a writable npm home for the non-root runner uid', () => {
    const workflow = projectFile('.github/workflows/staging-promote.yml')

    expect(workflow).toContain('--user "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/.npm')
  })

  it('runs repository-specific structural gates before merge', () => {
    const script = projectFile('scripts/repository-governance-validate.sh')

    expect(script).toContain('npm run arch:check')
    expect(script).toContain('npm run modules:check')
    expect(script).toContain('npm run migrations:check')
    expect(script).toContain('--fileParallelism=false')
  })

  it('delegates duplicate application CI checks while preserving the mandatory governance gates', () => {
    const script = projectFile('scripts/repository-governance-validate.sh')
    const workflow = projectFile('.github/workflows/repository-governance.yml')
    const ci = projectFile('.github/workflows/ci.yml')
    expect(workflow).toContain('bash scripts/repository-governance-validate.sh ci')
    expect(script).toContain('bash scripts/absolute-audit-governance-validate.sh')
    expect(script).toContain('bash scripts/agent-continuity-validate.sh')
    expect(script).toContain('check_project_boundaries')
    expect(script).toContain('AUDIT_LEDGER_BASE_SHA')
    expect(script).toContain('REPOSITORY_GOVERNANCE_APP_CHECKS=DELEGATED_TO_CI_IMPACT_SCOPE')
    const policyCheck = script.indexOf('node --test tests/dependabot-no-pr-contract.test.mjs')
    expect(policyCheck).toBeGreaterThan(-1)
    expect(policyCheck).toBeLessThan(script.indexOf('REPOSITORY_GOVERNANCE_APP_CHECKS=DELEGATED_TO_CI_IMPACT_SCOPE'))
    expect(script).toMatch(/if \[\[ "\$mode" == "ci" \]\]; then\s+echo .+\s+exit 0/u)
    expect(script.indexOf('REPOSITORY_GOVERNANCE_APP_CHECKS=DELEGATED_TO_CI_IMPACT_SCOPE')).toBeLessThan(
      script.indexOf('npm run lint'),
    )
    for (const check of ['lint', 'typecheck', 'unit', 'architecture', 'build', 'e2e']) {
      expect(ci).toContain('  ' + check + ':')
    }
    expect(ci).toContain('scripts/ci-impact-selection.py')
    expect(script).toContain('npm run build')
  })

  it('never tracks dependency installation directories', () => {
    const tracked = execFileSync('git', ['ls-files', '--', 'node_modules', 'node_modules/**'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()

    expect(tracked).toBe('')
  })
})
