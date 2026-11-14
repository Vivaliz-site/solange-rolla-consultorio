import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()
const checker = path.join(repositoryRoot, 'scripts/check-migrations.mjs')
const fixtureMigrations = path.join(
  repositoryRoot,
  'tests/architecture/migration-fixtures/base/supabase/migrations',
)
const temporaryRepositories: string[] = []
const temporaryExternalPaths: string[] = []

function runGit(repository: string, args: string[]) {
  execFileSync('git', args, {
    cwd: repository,
    stdio: 'pipe',
  })
}

function createRepository() {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-history-'))
  temporaryRepositories.push(repository)

  fs.mkdirSync(path.join(repository, 'supabase'), { recursive: true })
  fs.mkdirSync(path.join(repository, 'docs'), { recursive: true })
  fs.copyFileSync(
    path.join(repositoryRoot, 'docs/schema-ownership.json'),
    path.join(repository, 'docs/schema-ownership.json'),
  )
  fs.cpSync(
    fixtureMigrations,
    path.join(repository, 'supabase/migrations'),
    { recursive: true },
  )

  runGit(repository, ['init', '--quiet', '--initial-branch=main'])
  runGit(repository, ['config', 'user.email', 'architecture@example.test'])
  runGit(repository, ['config', 'user.name', 'Architecture Test'])
  runGit(repository, ['add', 'supabase/migrations'])
  runGit(repository, ['commit', '--quiet', '-m', 'base migrations'])
  runGit(repository, ['branch', 'migration-base'])

  return repository
}

function writeTaskContract(
  repository: string,
  filename: string,
  contract: {
    issue: number
    migration: string
    objects: Array<{ name: string; owner: string }>
    owners: string[]
  },
) {
  const contractsDirectory = path.join(repository, 'docs/task-contracts')
  fs.mkdirSync(contractsDirectory, { recursive: true })
  fs.writeFileSync(
    path.join(contractsDirectory, filename),
    `${JSON.stringify({ version: 1, status: 'approved', ...contract }, null, 2)}\n`,
  )
}

function checkMigrations(
  repository: string,
  options?: {
    baseRef?: string
    ci?: boolean
    environment?: Record<string, string>
  },
) {
  const args = [checker]
  if (options?.baseRef) {
    args.push('--base-ref', options.baseRef)
  }

  return spawnSync(process.execPath, args, {
    cwd: repository,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...options?.environment,
      ...(options?.ci ? { CI: 'true' } : { CI: '' }),
    },
  })
}

function outputOf(result: ReturnType<typeof checkMigrations>) {
  return `${result.stdout}\n${result.stderr}`
}

afterEach(() => {
  for (const repository of temporaryRepositories.splice(0)) {
    fs.rmSync(repository, { recursive: true, force: true })
  }
  for (const externalPath of temporaryExternalPaths.splice(0)) {
    fs.rmSync(externalPath, { recursive: true, force: true })
  }
})

describe('migration history', () => {
  it('rejects a filename with impossible UTC timestamp components', () => {
    const repository = createRepository()
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations/20260230030000_invalid_date.sql'),
      'select 1;\n',
    )

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      '20260230030000_invalid_date.sql: timestamp is not a real UTC date and time',
    )
  })

  it('rejects duplicate timestamp prefixes', () => {
    const repository = createRepository()
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations/20260824000100_another_base.sql'),
      'select 1;\n',
    )

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain('duplicate migration timestamp: 20260824000100')
  })

  it('rejects a base migration whose blob changed in the working tree', () => {
    const repository = createRepository()
    fs.appendFileSync(
      path.join(repository, 'supabase/migrations/20260824000100_extensions.sql'),
      '-- modified after application\n',
    )

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      'base migration was modified: supabase/migrations/20260824000100_extensions.sql',
    )
  })

  it('rejects a base migration deleted from the working tree', () => {
    const repository = createRepository()
    fs.rmSync(
      path.join(repository, 'supabase/migrations/20260824000200_queues.sql'),
    )

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      'base migration was deleted: supabase/migrations/20260824000200_queues.sql',
    )
  })

  it('fails closed in CI when the migration base cannot be resolved', () => {
    const repository = createRepository()

    const result = checkMigrations(repository, {
      baseRef: 'missing-migration-base',
      ci: true,
    })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      'unable to resolve migration base ref: missing-migration-base',
    )
  })

  it('accepts a valid forward-only migration after unchanged base migrations', () => {
    const repository = createRepository()
    const migration = '20260824000300_platform_add_queue_metrics.sql'
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations', migration),
      '-- owners: platform\n-- task-contract: docs/task-contracts/queue_metrics.json\nselect * from pgmq.queue_metrics;\n',
    )
    writeTaskContract(repository, 'queue_metrics.json', {
      issue: 123,
      migration,
      objects: [{ name: 'pgmq.queue_metrics', owner: 'platform' }],
      owners: ['platform'],
    })

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status, outputOf(result)).toBe(0)
  })

  it('requires a machine-readable owner declaration on new migrations', () => {
    const repository = createRepository()
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations/20260824000300_clinical.sql'),
      'create schema clinical;\n',
    )

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      '20260824000300_clinical.sql: missing "-- owners: clinical" declaration',
    )
  })

  it('rejects owners that do not match the migration description prefix', () => {
    const repository = createRepository()
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations/20260824000300_clinical.sql'),
      '-- owners: people\ncreate schema clinical;\n',
    )

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      '20260824000300_clinical.sql: declared owners "people" do not match expected owners "clinical"',
    )
  })

  it('requires a Task Contract marker for cross-module migrations', () => {
    const repository = createRepository()
    fs.writeFileSync(
      path.join(
        repository,
        'supabase/migrations/20260824000300_bind_cancellation_legal_version.sql',
      ),
      '-- owners: appointments, forms\nselect 1;\n',
    )

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      '20260824000300_bind_cancellation_legal_version.sql: missing "-- cross-module-task: docs/task-contracts/<contract>.json"',
    )
  })

  it('accepts a cross-module migration with matching owners and Task Contract', () => {
    const repository = createRepository()
    const migration =
      '20260824000300_bind_cancellation_legal_version.sql'
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations', migration),
      '-- owners: appointments, forms\n-- cross-module-task: docs/task-contracts/cancellation_legal.json\nalter table public.cancellation_policies add column legal_document_version_id uuid;\nselect * from public.legal_document_versions;\n',
    )
    writeTaskContract(repository, 'cancellation_legal.json', {
      issue: 123,
      migration,
      objects: [
        { name: 'public.cancellation_policies', owner: 'appointments' },
        { name: 'public.legal_document_versions', owner: 'forms' },
      ],
      owners: ['appointments', 'forms'],
    })

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status, outputOf(result)).toBe(0)
  })

  it('requires a repository-local Task Contract for single-owner migrations', () => {
    const repository = createRepository()
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations/20260824000300_clinical.sql'),
      '-- owners: clinical\nselect 1;\n',
    )

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      '20260824000300_clinical.sql: missing "-- task-contract: docs/task-contracts/<contract>.json"',
    )
  })

  it('rejects a Task Contract without a positive issue number', () => {
    const repository = createRepository()
    const migration = '20260824000300_clinical.sql'
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations', migration),
      '-- owners: clinical\n-- task-contract: docs/task-contracts/clinical.json\nselect 1;\n',
    )
    writeTaskContract(repository, 'clinical.json', {
      issue: 0,
      migration,
      objects: [{ name: 'clinical.records', owner: 'clinical' }],
      owners: ['clinical'],
    })

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      'clinical.json: issue must be a positive integer',
    )
  })

  it('rejects contract objects assigned outside the declared owners', () => {
    const repository = createRepository()
    const migration = '20260824000300_people_add_preferences.sql'
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations', migration),
      '-- owners: people\n-- task-contract: docs/task-contracts/people.json\nselect 1;\n',
    )
    writeTaskContract(repository, 'people.json', {
      issue: 123,
      migration,
      objects: [{ name: 'public.people', owner: 'clinical' }],
      owners: ['people'],
    })

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      'people.json: object "public.people" owner "clinical" is not a declared migration owner',
    )
  })

  it('rejects SQL objects omitted from the Task Contract', () => {
    const repository = createRepository()
    const migration = '20260824000300_people_add_preferences.sql'
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations', migration),
      '-- owners: people\n-- task-contract: docs/task-contracts/people.json\nalter table public.people add column preferred_name text;\nselect * from clinical.records;\n',
    )
    writeTaskContract(repository, 'people.json', {
      issue: 123,
      migration,
      objects: [{ name: 'public.people', owner: 'people' }],
      owners: ['people'],
    })

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      'people.json: SQL object "clinical.records" is missing from the contract',
    )
  })

  it('fails closed for dynamic SQL in a new migration', () => {
    const repository = createRepository()
    const migration = '20260824000300_platform_add_runtime_policy.sql'
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations', migration),
      '-- owners: platform\n-- task-contract: docs/task-contracts/runtime.json\nDO $$ BEGIN EXECUTE \'select 1\'; END $$;\n',
    )
    writeTaskContract(repository, 'runtime.json', {
      issue: 123,
      migration,
      objects: [{ name: 'platform.functions', owner: 'platform' }],
      owners: ['platform'],
    })

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      `${migration}: SQL contains unsupported or dynamic syntax`,
    )
  })

  it('rejects SQL references hidden behind an unhandled table command', () => {
    const repository = createRepository()
    const migration = '20260824000300_people_add_cleanup.sql'
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations', migration),
      '-- owners: people\n-- task-contract: docs/task-contracts/cleanup.json\nselect * from public.people;\ntruncate clinical.records;\n',
    )
    writeTaskContract(repository, 'cleanup.json', {
      issue: 123,
      migration,
      objects: [{ name: 'public.people', owner: 'people' }],
      owners: ['people'],
    })

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      'cleanup.json: SQL object "clinical.records" is missing from the contract',
    )
  })

  it('rejects a Task Contract symlink that resolves outside its directory', () => {
    const repository = createRepository()
    const externalDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'external-contract-'))
    temporaryExternalPaths.push(externalDirectory)
    fs.writeFileSync(
      path.join(externalDirectory, 'escape.json'),
      JSON.stringify({
        version: 1,
        status: 'approved',
        issue: 123,
        migration: '20260824000300_platform_escape.sql',
        owners: ['platform'],
        objects: [{ name: 'pgmq.queue_metrics', owner: 'platform' }],
      }),
    )
    fs.mkdirSync(path.join(repository, 'docs'), { recursive: true })
    fs.symlinkSync(externalDirectory, path.join(repository, 'docs/task-contracts'), 'dir')
    const migration = '20260824000300_platform_escape.sql'
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations', migration),
      '-- owners: platform\n-- task-contract: docs/task-contracts/escape.json\nselect * from pgmq.queue_metrics;\n',
    )

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      'escape.json: Task Contract must resolve inside docs/task-contracts',
    )
  })

  it('fails closed for comma-separated table targets', () => {
    const repository = createRepository()
    const migration = '20260824000300_clinical.sql'
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations', migration),
      '-- owners: clinical\n-- task-contract: docs/task-contracts/clinical.json\ntruncate clinical.records, public.people;\n',
    )
    writeTaskContract(repository, 'clinical.json', {
      issue: 123,
      migration,
      objects: [{ name: 'clinical.records', owner: 'clinical' }],
      owners: ['clinical'],
    })

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain('SQL contains unsupported or dynamic syntax')
  })

  it('fails closed for unhandled function operations', () => {
    const repository = createRepository()
    const migration = '20260824000300_clinical.sql'
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations', migration),
      '-- owners: clinical\n-- task-contract: docs/task-contracts/clinical.json\ncreate function clinical.read_record() returns void language sql as $$ select 1 $$;\n',
    )
    writeTaskContract(repository, 'clinical.json', {
      issue: 123,
      migration,
      objects: [{ name: 'clinical.records', owner: 'clinical' }],
      owners: ['clinical'],
    })

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain('SQL contains unsupported or dynamic syntax')
  })

  it('fails closed for unhandled PostgreSQL DDL objects', () => {
    const repository = createRepository()
    const migration = '20260824000300_platform_add_collation.sql'
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations', migration),
      '-- owners: platform\n-- task-contract: docs/task-contracts/collation.json\ncreate collation platform.test_collation (provider = icu, locale = \'und\');\n',
    )
    writeTaskContract(repository, 'collation.json', {
      issue: 123,
      migration,
      objects: [{ name: 'platform.extensions', owner: 'platform' }],
      owners: ['platform'],
    })

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain('SQL contains unsupported or dynamic syntax')
  })

  it('fails closed for comma-separated DROP targets', () => {
    const repository = createRepository()
    const migration = '20260824000300_people_drop_cleanup.sql'
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations', migration),
      '-- owners: people\n-- task-contract: docs/task-contracts/drop.json\ndrop table public.people, clinical.records;\n',
    )
    writeTaskContract(repository, 'drop.json', {
      issue: 123,
      migration,
      objects: [{ name: 'public.people', owner: 'people' }],
      owners: ['people'],
    })

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain('SQL contains unsupported or dynamic syntax')
  })

  it('fails closed for unsupported DDL statement families', () => {
    const repository = createRepository()
    const migration = '20260824000300_platform_text_search.sql'
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations', migration),
      '-- owners: platform\n-- task-contract: docs/task-contracts/search.json\nselect * from pgmq.queue_metrics;\nalter system set work_mem = \'64MB\';\n',
    )
    writeTaskContract(repository, 'search.json', {
      issue: 123,
      migration,
      objects: [{ name: 'pgmq.queue_metrics', owner: 'platform' }],
      owners: ['platform'],
    })

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain('SQL contains unsupported or dynamic syntax')
  })

  it('rejects removing an existing manifest owner', () => {
    const repository = createRepository()
    const manifest = {
      version: 1,
      owners: ['clinical', 'platform'],
      descriptionAliases: {},
      objects: {},
    }
    fs.mkdirSync(path.join(repository, 'docs'), { recursive: true })
    fs.writeFileSync(
      path.join(repository, 'docs/schema-ownership.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    )
    runGit(repository, ['add', 'docs/schema-ownership.json'])
    runGit(repository, ['commit', '--quiet', '-m', 'add ownership manifest'])
    fs.writeFileSync(
      path.join(repository, 'docs/schema-ownership.json'),
      `${JSON.stringify({ ...manifest, owners: ['clinical'] }, null, 2)}\n`,
    )

    const result = checkMigrations(repository, { baseRef: 'HEAD' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain('schema ownership owner cannot be removed')
  })

  it('rejects an owner declaration hidden after executable SQL', () => {
    const repository = createRepository()
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations/20260824000300_clinical.sql'),
      'select 1;\n-- owners: clinical\n',
    )

    const result = checkMigrations(repository, { baseRef: 'migration-base' })

    expect(result.status).not.toBe(0)
    expect(outputOf(result)).toContain(
      '20260824000300_clinical.sql: missing "-- owners: clinical" declaration',
    )
  })

  it('falls back to origin/main when a CI base-ref environment variable is empty', () => {
    const repository = createRepository()
    runGit(repository, ['update-ref', 'refs/remotes/origin/main', 'migration-base'])

    const result = checkMigrations(repository, {
      environment: {
        GITHUB_EVENT_PULL_REQUEST_BASE_SHA: '',
        MIGRATION_BASE_REF: '',
      },
    })

    expect(result.status, outputOf(result)).toBe(0)
  })

  it('accepts static alter table drop and add constraint syntax', () => {
    const repository = createRepository()
    const migration = '20260824000300_appointments_constraint_refresh.sql'
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations', migration),
      '-- owners: appointments\n-- task-contract: docs/task-contracts/appointments_constraint.json\nalter table public.appointments drop constraint appointments_status_check;\nalter table public.appointments add constraint appointments_status_check check (status <> \'invalid\');\n',
    )
    writeTaskContract(repository, 'appointments_constraint.json', {
      issue: 123, migration, owners: ['appointments'],
      objects: [{ name: 'public.appointments', owner: 'appointments' }],
    })

    const result = checkMigrations(repository, { baseRef: 'migration-base' })
    expect(result.status, outputOf(result)).toBe(0)
  })

  it('accepts alter column drop not null as a sub-clause of alter table, not a second DDL target', () => {
    const repository = createRepository()
    const migration = '20260824000340_appointments_optional_field.sql'
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations', migration),
      '-- owners: appointments\n-- task-contract: docs/task-contracts/appointments_optional_field.json\nalter table public.appointments alter column policy_version drop not null;\n',
    )
    writeTaskContract(repository, 'appointments_optional_field.json', {
      issue: 124, migration, owners: ['appointments'],
      objects: [{ name: 'public.appointments', owner: 'appointments' }],
    })

    const result = checkMigrations(repository, { baseRef: 'migration-base' })
    expect(result.status, outputOf(result)).toBe(0)
  })

  it('accepts PL/pgSQL SELECT INTO locals in explicitly static routines', () => {
    const repository = createRepository()
    const migration = '20260824000350_receivables_static_function.sql'
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations', migration),
      '-- owners: receivables\n-- task-contract: docs/task-contracts/receivables_static_function.json\n-- allow-static-routines: true\ncreate or replace function public.refresh_receivable_status_atomic(p_receivable_id uuid) returns text language plpgsql set search_path = public as $$ declare current_status text; begin select status into current_status from public.receivables where id = p_receivable_id; return current_status; end; $$;\n',
    )
    writeTaskContract(repository, 'receivables_static_function.json', {
      issue: 124, migration, owners: ['receivables'],
      objects: [
        { name: 'public.refresh_receivable_status_atomic', owner: 'receivables' },
        { name: 'public.receivables', owner: 'receivables' },
      ],
    })
    const result = checkMigrations(repository, { baseRef: 'migration-base' })
    expect(result.status, outputOf(result)).toBe(0)
  })

  it('treats service_role grant and revoke targets as roles, not SQL objects', () => {
    const repository = createRepository()
    const migration = '20260824000355_forms_service_role_privileges.sql'
    fs.writeFileSync(
      path.join(repository, 'supabase/migrations', migration),
      '-- owners: forms\n-- task-contract: docs/task-contracts/forms_service_role_privileges.json\nrevoke all on public.form_templates from service_role;\ngrant select on public.form_templates to service_role;\n',
    )
    writeTaskContract(repository, 'forms_service_role_privileges.json', {
      issue: 127, migration, owners: ['forms'],
      objects: [{ name: 'public.form_templates', owner: 'forms' }],
    })

    const result = checkMigrations(repository, { baseRef: 'migration-base' })
    expect(result.status, outputOf(result)).toBe(0)
  })

  it('exposes immutable migration history as an npm and database CI gate', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> }
    const workflow = fs.readFileSync(
      path.join(repositoryRoot, '.github/workflows/db.yml'),
      'utf8',
    )

    expect(packageJson.scripts['migrations:check']).toBe(
      'node scripts/check-migrations.mjs',
    )
    expect(workflow).toContain('fetch-depth: 0')
    expect(workflow).toContain('name: Migration history')
    expect(workflow).toContain('github.event.before')
    expect(workflow).toContain('run: npm run migrations:check')
    expect(workflow).toContain('npx supabase@2.118.0 db start')
    expect(workflow).toContain('npx supabase@2.118.0 db reset')
    expect(workflow).toContain('npx supabase@2.118.0 test db')
    expect(workflow).toContain('npx supabase@2.118.0 gen types typescript --local')
  })

  it('documents clinical and platform schema ownership boundaries', () => {
    const ownership = fs.readFileSync(
      path.join(repositoryRoot, 'docs/SCHEMA_OWNERSHIP.md'),
      'utf8',
    )

    expect(ownership).toContain('clinical schema is exclusively owned by `clinical`')
    expect(ownership).toContain('cross-module Task Contract')
    expect(ownership).toContain('`public.queue_send`')
    expect(ownership).toContain('`pgmq` schema')
  })
})
