import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
// os.devNull is the native Win32 device path (\\.\nul) on Windows, which
// Git for Windows' MSYS2 runtime cannot read as a config file location
// ("fatal: unable to access '\\.\nul': Invalid argument"). Git's own path
// translation layer accepts the POSIX spelling on every platform it runs on.
const isolatedGitEnv = { ...process.env, GIT_CONFIG_GLOBAL: process.platform === 'win32' ? '/dev/null' : os.devNull, GIT_CONFIG_NOSYSTEM: '1' }

function git(cwd: string, args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: isolatedGitEnv }).trim()
}

function makeExecutable(file: string) {
  try { chmodSync(file, 0o755) } catch { /* Windows may ignore POSIX mode bits. */ }
}

const bashAvailable = process.platform !== 'win32'
  || spawnSync('bash', ['-c', 'exit 0'], { stdio: 'ignore' }).status === 0

describe('pre-push worktree isolation', () => {
  it.skipIf(!bashAvailable)('clears exported parent Git context before validator child repositories run', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'prepush-worktree-'))
    const repo = path.join(root, 'repo')
    mkdirSync(repo)
    try {
      git(repo, ['init', '--quiet'])
      git(repo, ['config', 'user.email', 'outer@example.test'])
      git(repo, ['config', 'user.name', 'Outer Test'])

      const hooks = path.join(repo, '.githooks')
      const scripts = path.join(repo, 'scripts')
      mkdirSync(hooks)
      mkdirSync(scripts)
      const hook = path.join(hooks, 'pre-push')
      copyFileSync(path.join(projectRoot, '.githooks/pre-push'), hook)
      makeExecutable(hook)
      const validator = path.join(scripts, 'repository-governance-validate.sh')
      writeFileSync(validator, [
        '#!/usr/bin/env bash',
        'set -Eeuo pipefail',
        'nested="$(mktemp -d)"',
        `trap 'rm -rf "$nested"' EXIT`,
        'cd "$nested"',
        'git init --quiet',
        'git config user.email nested@example.test',
        "git config user.name 'Nested Test'",
        'echo nested > nested.txt',
        'git add nested.txt',
        'git commit --quiet -m nested',
        '',
      ].join('\n'))
      makeExecutable(validator)
      writeFileSync(path.join(repo, 'base.txt'), 'base\n')
      git(repo, ['add', '.'])
      git(repo, ['commit', '--quiet', '-m', 'base'])
      git(repo, ['checkout', '--quiet', '-b', 'feature'])

      const head = git(repo, ['rev-parse', 'HEAD'])
      const hookEnv = {
        ...isolatedGitEnv,
        GIT_DIR: path.join(repo, '.git'),
        GIT_WORK_TREE: repo,
        GIT_INDEX_FILE: path.join(repo, '.git', 'index'),
      }
      // Windows has no shebang execution, so a hook file cannot be spawned
      // directly; invoke it through the same bash that runs it under real
      // Git for Windows hook execution.
      const [command, args] = process.platform === 'win32'
        ? ['bash', [hook, 'origin', 'unused']]
        : [hook, ['origin', 'unused']]
      const result = spawnSync(command, args, {
        cwd: repo,
        encoding: 'utf8',
        env: hookEnv,
        input: `refs/heads/feature ${head} refs/heads/feature ${'0'.repeat(40)}\n`,
      })

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
      expect(git(repo, ['log', '-1', '--pretty=%s'])).toBe('base')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
