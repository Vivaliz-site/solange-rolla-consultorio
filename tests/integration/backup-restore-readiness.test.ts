import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))

function makeExecutable(file: string) {
  chmodSync(file, 0o755)
}

describe('backup restore drill readiness', () => {
  it('waits for final startup and restores into a clean Supabase-compatible database', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'restore-readiness-'))
    const bin = path.join(root, 'bin')
    const state = path.join(root, 'state')
    const backup = path.join(root, 'backup.dump')
    mkdirSync(bin)
    mkdirSync(state)
    writeFileSync(backup, 'fixture')
    writeFileSync(`${backup}.sha256`, `${createHash('sha256').update('fixture').digest('hex')}  backup.dump\n`)

    const docker = path.join(bin, 'docker')
    writeFileSync(docker, `#!/bin/sh
set -eu
state=\${FAKE_DOCKER_STATE:?}
cmd=\$1
shift
printf '%s %s\\n' "\$cmd" "\$*" >> "\$state/invocations"
case "\$cmd" in
  run) exit 0 ;;
  logs)
    n=0
    [ -f "\$state/logs" ] && n=\$(cat "\$state/logs")
    n=\$((n + 1))
    printf '%s' "\$n" > "\$state/logs"
    if [ "\$n" -ge 2 ]; then
      echo 'PostgreSQL init process complete; ready for start up.'
      : > "\$state/final-ready"
    fi
    exit 0
    ;;
  exec)
    while [ "\${1:-}" = '-e' ]; do shift 2; done
    name=\$1
    shift
    sub=\$1
    shift
    case "\$sub" in
      pg_isready) exit 0 ;;
      createdb) exit 0 ;;
      psql)
        if [ ! -f "\$state/final-ready" ]; then
          echo 'simulated socket disappeared during init restart' >&2
          exit 2
        fi
        case " \$* " in
          *' -Atc '*) echo 't|t|t|t' ;;
        esac
        exit 0
        ;;
      pg_restore) exit 0 ;;
    esac
    ;;
  rm) exit 0 ;;
esac
echo "unexpected docker invocation: \$cmd \$*" >&2
exit 99
`)
    makeExecutable(docker)

    try {
      const result = spawnSync('sh', [path.join(projectRoot, 'scripts/verify-backup-restore-docker.sh')], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          FAKE_DOCKER_STATE: state,
          BACKUP_FILE: backup,
        },
      })

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
      expect(result.stdout).toContain('restore_success')
      expect(result.stdout).toContain('scope=legacy_local_only')
      expect(result.stdout).toContain('managed_staging_certified=false')

      const invocations = readFileSync(path.join(state, 'invocations'), 'utf8')
      expect(invocations).toContain('public.ecr.aws/supabase/postgres:15.8.1.085')
      expect(invocations).toMatch(/exec -e PGPASSWORD=restore-only .* createdb -U supabase_admin -T template0 solange_restore/)
      expect(invocations).toMatch(/exec -e PGPASSWORD=restore-only .* pg_restore -U supabase_admin -d solange_restore --no-owner --no-privileges --exit-on-error/)
      expect(invocations).toMatch(/exec -e PGPASSWORD=restore-only .* psql -U supabase_admin -d solange_restore .*drop schema public/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
