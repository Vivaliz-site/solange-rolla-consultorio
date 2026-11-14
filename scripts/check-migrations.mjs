import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const migrationNamePattern = /^(?<timestamp>\d{14})_(?<description>[a-z][a-z0-9]*(?:_[a-z0-9]+)*)\.sql$/u
const ownershipManifest = JSON.parse(
  fs.readFileSync(path.resolve('docs/schema-ownership.json'), 'utf8'),
)
const schemaOwners = new Set(ownershipManifest.owners)
const specialDescriptionOwners = new Map(
  Object.entries(ownershipManifest.descriptionAliases),
)
const objectOwners = new Map(Object.entries(ownershipManifest.objects))

function parseArguments(argumentsList) {
  const options = { baseRef: undefined }

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index]
    const value = argumentsList[index + 1]

    if (argument === '--base-ref' && value) {
      options.baseRef = value
      index += 1
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`)
    }
  }

  return options
}

function runGit(argumentsList) {
  const result = spawnSync('git', argumentsList, {
    encoding: 'utf8',
  })

  if (result.error) {
    throw result.error
  }

  return result
}

function resolveBaseRef(options) {
  return [
    options.baseRef,
    process.env.MIGRATION_BASE_REF,
    process.env.GITHUB_EVENT_PULL_REQUEST_BASE_SHA,
    'origin/main',
  ].find((candidate) => candidate?.trim())
}

function resolveCommit(ref) {
  const result = runGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])

  if (result.status !== 0) {
    throw new Error(`unable to resolve migration base ref: ${ref}`)
  }

  return result.stdout.trim()
}

function migrationDirectory() {
  const directory = path.resolve('supabase/migrations')

  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error('migration directory does not exist: supabase/migrations')
  }

  return directory
}

function migrationDirectoryPathspec(directory) {
  const relativePath = path.relative(process.cwd(), directory)

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('migration directory must be within the repository root')
  }

  return relativePath.split(path.sep).join('/')
}

function currentMigrations(directory, directoryPathspec) {
  const errors = []
  const migrations = []

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile()) {
      errors.push(`${entry.name}: migration entries must be SQL files`)
      continue
    }

    const match = entry.name.match(migrationNamePattern)
    if (!match?.groups) {
      errors.push(
        `${entry.name}: must match YYYYMMDDHHMMSS_description.sql with a lowercase snake_case description`,
      )
      continue
    }

    const timestamp = match.groups.timestamp
    if (!isRealUtcTimestamp(timestamp)) {
      errors.push(
        `${entry.name}: timestamp is not a real UTC date and time`,
      )
      continue
    }

    migrations.push({
      description: match.groups.description,
      name: entry.name,
      path: `${directoryPathspec}/${entry.name}`,
      timestamp,
    })
  }

  migrations.sort((left, right) => left.name.localeCompare(right.name))
  return { errors, migrations }
}

function isRealUtcTimestamp(timestamp) {
  const year = Number(timestamp.slice(0, 4))
  const month = Number(timestamp.slice(4, 6))
  const day = Number(timestamp.slice(6, 8))
  const hour = Number(timestamp.slice(8, 10))
  const minute = Number(timestamp.slice(10, 12))
  const second = Number(timestamp.slice(12, 14))

  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return false
  }

  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day >= 1 && day <= daysInMonth[month - 1]
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function validateTimestampOrder(migrations) {
  const errors = []
  let previousTimestamp

  for (const migration of migrations) {
    if (previousTimestamp && migration.timestamp <= previousTimestamp) {
      if (migration.timestamp === previousTimestamp) {
        errors.push(`duplicate migration timestamp: ${migration.timestamp}`)
      } else {
        errors.push('migration timestamps must be strictly increasing')
      }
    }
    previousTimestamp = migration.timestamp
  }

  return errors
}

function baseMigrationBlobs(baseCommit, directoryPathspec) {
  const result = runGit([
    'ls-tree',
    '-r',
    '-z',
    baseCommit,
    '--',
    directoryPathspec,
  ])

  if (result.status !== 0) {
    throw new Error(`unable to list migrations from base ref: ${baseCommit}`)
  }

  return result.stdout
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(?<mode>\d+) (?<type>\w+) (?<blob>[0-9a-f]+)\t(?<path>.+)$/u)
      if (!match?.groups || match.groups.type !== 'blob') {
        throw new Error('unable to parse migration blobs from git ls-tree')
      }

      return {
        blob: match.groups.blob,
        path: match.groups.path,
      }
    })
}

function currentBlobHash(migrationPath) {
  const result = runGit(['hash-object', '--', migrationPath])

  if (result.status !== 0) {
    throw new Error(`unable to hash migration: ${migrationPath}`)
  }

  return result.stdout.trim()
}

function validateBaseHistory(baseMigrations, migrations) {
  const errors = []
  const currentPaths = new Map(migrations.map((migration) => [migration.path, migration]))
  const basePaths = new Set(baseMigrations.map((migration) => migration.path))
  let latestBaseTimestamp

  for (const migration of baseMigrations) {
    const current = currentPaths.get(migration.path)
    if (!current) {
      errors.push(`base migration was deleted: ${migration.path}`)
      continue
    }

    if (currentBlobHash(migration.path) !== migration.blob) {
      errors.push(`base migration was modified: ${migration.path}`)
    }

    const baseName = path.posix.basename(migration.path)
    const match = baseName.match(migrationNamePattern)
    if (match?.groups?.timestamp) {
      latestBaseTimestamp =
        !latestBaseTimestamp || match.groups.timestamp > latestBaseTimestamp
          ? match.groups.timestamp
          : latestBaseTimestamp
    }
  }

  if (latestBaseTimestamp) {
    for (const migration of migrations) {
      if (!basePaths.has(migration.path) && migration.timestamp <= latestBaseTimestamp) {
        errors.push(
          `new migration must be forward-only after ${latestBaseTimestamp}: ${migration.path}`,
        )
      }
    }
  }

  return errors
}

function expectedOwnersFor(description) {
  const specialOwners = specialDescriptionOwners.get(description)
  if (specialOwners) {
    return specialOwners
  }

  const prefix = description.split('_', 1)[0]
  return schemaOwners.has(prefix) ? [prefix] : undefined
}

function declaredOwnersFor(migration) {
  const sql = fs.readFileSync(migration.path, 'utf8')
  const headerLines = []

  for (const line of sql.split(/\r?\n/u)) {
    if (line.trim() === '' || line.startsWith('--')) {
      headerLines.push(line)
      continue
    }
    break
  }

  const header = headerLines.join('\n')
  const declarations = [
    ...header.matchAll(/^-- owners:\s*([^\r\n]+?)\s*$/gmu),
  ]

  if (declarations.length !== 1) {
    return { header }
  }

  const owners = declarations[0][1]
    .split(',')
    .map((owner) => owner.trim())
    .filter(Boolean)

  return { header, owners: [...new Set(owners)].sort() }
}

function sqlTokens(sql) {
  const tokens = []
  let unsupported = false
  let index = 0

  while (index < sql.length) {
    if (/\s/u.test(sql[index])) {
      index += 1
      continue
    }
    if (sql.startsWith('--', index)) {
      const end = sql.indexOf('\n', index + 2)
      index = end === -1 ? sql.length : end + 1
      continue
    }
    if (sql.startsWith('/*', index)) {
      const end = sql.indexOf('*/', index + 2)
      if (end === -1) {
        unsupported = true
        break
      }
      index = end + 2
      continue
    }
    if (sql[index] === "'") {
      index += 1
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") {
          index += 2
          continue
        }
        if (sql[index] === "'") {
          index += 1
          break
        }
        index += 1
      }
      continue
    }
    if (sql[index] === '"') {
      let identifier = ''
      index += 1
      while (index < sql.length) {
        if (sql[index] === '"' && sql[index + 1] === '"') {
          identifier += '"'
          index += 2
          continue
        }
        if (sql[index] === '"') {
          index += 1
          break
        }
        identifier += sql[index]
        index += 1
      }
      tokens.push(identifier.toLowerCase())
      continue
    }

    const dollarTag = sql.slice(index).match(/^\$[a-z_][a-z0-9_]*\$|^\$\$/iu)
    if (dollarTag) {
      const tag = dollarTag[0]
      const bodyStart = index + tag.length
      const bodyEnd = sql.indexOf(tag, bodyStart)
      if (bodyEnd === -1) {
        unsupported = true
        break
      }
      const nested = sqlTokens(sql.slice(bodyStart, bodyEnd))
      tokens.push(...nested.tokens)
      unsupported ||= nested.unsupported
      index = bodyEnd + tag.length
      continue
    }

    const word = sql.slice(index).match(/^[a-z_][a-z0-9_$]*/iu)
    if (word) {
      tokens.push(word[0].toLowerCase())
      index += word[0].length
      continue
    }

    tokens.push(sql[index])
    index += 1
  }

  return { tokens, unsupported }
}

function objectFromTokens(tokens, startIndex) {
  let index = startIndex
  while (['if', 'not', 'exists', 'only', 'table', 'view', 'sequence'].includes(tokens[index])) {
    index += 1
  }
  const first = tokens[index]
  if (!first || !/^[a-z_][a-z0-9_$]*$/u.test(first)) {
    return undefined
  }
  if (tokens[index + 1] === '.' && /^[a-z_][a-z0-9_$]*$/u.test(tokens[index + 2] ?? '')) {
    return `${first}.${tokens[index + 2]}`
  }
  return `public.${first}`
}

function sqlObjects(migration) {
  const sql = fs.readFileSync(migration.path, 'utf8')
  const allowStaticRoutines = /^-- allow-static-routines:\s*true\s*$/mu.test(sql)
  const parsed = sqlTokens(sql)
  const objects = new Set()
  const { tokens } = parsed

  const ignoredExternalOrPseudoObjects = new Set([
    'public.anon',
    'public.authenticated',
    'public.service_role',
    'public.skip',
    'public.column',
    'public.function',
    'public.on',
    'public.public',
    'public.to',
    'public.)',
    'public.jsonb',
    'public.or',
    'public.current_row',
    'public.set',
  ])
  const recordObject = (object) => {
    if (!object || object.startsWith('auth.') || ignoredExternalOrPseudoObjects.has(object)) return
    objects.add(object)
  }
  const multiTargetCommands = new Set([
    'analyze',
    'lock',
    'reindex',
    'truncate',
    'vacuum',
    'drop',
  ])
  const supportedDdlTargets = {
    alter: new Set(['extension', 'schema', 'sequence', 'table', 'view']),
    create: new Set(['extension', 'function', 'index', 'policy', 'schema', 'sequence', 'table', 'trigger', 'type', 'view']),
    drop: new Set(['extension', 'index', 'policy', 'schema', 'sequence', 'table', 'view']),
  }
  const staticRoutineTargets = new Set(['function', 'policy', 'trigger', 'type'])

  const alterTableDropSubClauses = new Set(['constraint', 'not', 'default'])
  const isAlterTableStatement = (index) => {
    let start = index - 1
    while (start >= 0 && tokens[start] !== ';') start -= 1
    const statement = tokens.slice(start + 1, index)
    return statement[0] === 'alter' && statement[1] === 'table'
  }
  const isAlterTableSubClause = (index) => {
    if (tokens[index] === 'drop' && alterTableDropSubClauses.has(tokens[index + 1])) {
      return isAlterTableStatement(index)
    }
    // "alter column ..." is a sub-clause of an enclosing ALTER TABLE, not a
    // second top-level ALTER statement, and has no DDL target of its own.
    if (tokens[index] === 'alter' && tokens[index + 1] === 'column') {
      return isAlterTableStatement(index)
    }
    return false
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const alterTableSubClause = isAlterTableSubClause(index)
    if (token === 'execute' && ['begin', 'do'].includes(tokens[index - 1])) {
      parsed.unsupported = true
      continue
    }
    if (supportedDdlTargets[token] && !alterTableSubClause) {
      let targetIndex = index + 1
      while (['if', 'not', 'exists', 'or', 'replace', 'temporary', 'unlogged', 'unique'].includes(tokens[targetIndex])) {
        targetIndex += 1
      }
      if (
        !supportedDdlTargets[token].has(tokens[targetIndex])
        || (staticRoutineTargets.has(tokens[targetIndex]) && !allowStaticRoutines)
      ) {
        parsed.unsupported = true
      }
      if (token === 'create' && tokens[targetIndex] === 'function') {
        recordObject(objectFromTokens(tokens, targetIndex + 1))
      }
    }
    if (token === 'reassign') {
      parsed.unsupported = true
    }
    if (multiTargetCommands.has(token) && !alterTableSubClause) {
      for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
        if (tokens[cursor] === ';') break
        if (tokens[cursor] === ',') {
          parsed.unsupported = true
          break
        }
      }
    }
    if (token === 'extension') {
      recordObject('platform.extensions')
      continue
    }
    if (token === 'schema') {
      if (!['create', 'alter'].includes(tokens[index - 1])) continue
      const schemaName = tokens[index + 1]
      if (schemaName) {
        const objectName = schemaName === 'clinical' ? 'clinical.__schema__' : `public.${schemaName}`
        recordObject(objectName)
      }
      continue
    }
    if (token === 'update' && tokens[index - 1] === 'do' && tokens[index + 1] === 'set') {
      continue
    }
    if (token === 'into' && allowStaticRoutines && tokens[index - 1] !== 'insert') {
      continue
    }
    if (
      [
        'table',
        'view',
        'sequence',
        'truncate',
        'copy',
        'analyze',
        'lock',
        'reindex',
        'vacuum',
        'into',
        'update',
        'from',
        'join',
        'references',
      ].includes(token)
    ) {
      if (token === 'copy' && tokens[index + 1] === '(') {
        parsed.unsupported = true
        continue
      }
      const object = objectFromTokens(tokens, index + 1)
      if (object) {
        recordObject(object)
      }
      continue
    }
    if (token === 'on' && tokens[index + 1] === 'schema') {
      const schemaName = tokens[index + 2]
      if (schemaName) recordObject(schemaName === 'clinical' ? 'clinical.__schema__' : `public.${schemaName}`)
      continue
    }
    if (token === 'on' && !['conflict', 'delete', 'update'].includes(tokens[index + 1])) {
      const object = objectFromTokens(tokens, index + 1)
      if (object) {
        recordObject(object)
      }
    }
  }

  return { objects, unsupported: parsed.unsupported }
}

function validateTaskContract(migration, owners, header) {
  const errors = []
  const marker = owners.length > 1 ? 'cross-module-task' : 'task-contract'
  const expectedMarker = `-- ${marker}: docs/task-contracts/<contract>.json`
  const markerPattern = new RegExp(
    `^-- ${marker}:\\s*(docs/task-contracts/[a-z0-9][a-z0-9_-]*\\.json)\\s*$`,
    'gmu',
  )
  const references = [...header.matchAll(markerPattern)]

  if (references.length !== 1) {
    return [`${migration.name}: missing "${expectedMarker}"`]
  }

  const contractPath = references[0][1]
  const contractName = path.posix.basename(contractPath)
  const absoluteContractPath = path.resolve(contractPath)
  const contractDirectory = path.resolve('docs/task-contracts')
  const relativeContractPath = path.relative(process.cwd(), absoluteContractPath)

  if (
    relativeContractPath.startsWith('..') ||
    path.isAbsolute(relativeContractPath) ||
    !fs.existsSync(absoluteContractPath) ||
    !fs.statSync(absoluteContractPath).isFile()
  ) {
    return [`${contractName}: Task Contract file does not exist`]
  }

  let realContractPath
  let realContractDirectory
  try {
    if (
      fs.lstatSync(contractDirectory).isSymbolicLink() ||
      fs.lstatSync(absoluteContractPath).isSymbolicLink()
    ) {
      return [`${contractName}: Task Contract must resolve inside docs/task-contracts`]
    }
    realContractPath = fs.realpathSync(absoluteContractPath)
    realContractDirectory = fs.realpathSync(contractDirectory)
  } catch {
    return [`${contractName}: Task Contract file cannot be resolved safely`]
  }
  const relativeRealContractPath = path.relative(realContractDirectory, realContractPath)
  if (
    relativeRealContractPath.startsWith('..') ||
    path.isAbsolute(relativeRealContractPath)
  ) {
    return [`${contractName}: Task Contract must resolve inside docs/task-contracts`]
  }

  let contract
  try {
    contract = JSON.parse(fs.readFileSync(absoluteContractPath, 'utf8'))
  } catch {
    return [`${contractName}: Task Contract must be valid JSON`]
  }

  if (contract.version !== 1) {
    errors.push(`${contractName}: version must be 1`)
  }
  if (contract.status !== 'approved') {
    errors.push(`${contractName}: status must be "approved"`)
  }
  if (!Number.isInteger(contract.issue) || contract.issue <= 0) {
    errors.push(`${contractName}: issue must be a positive integer`)
  }
  if (contract.migration !== migration.name) {
    errors.push(`${contractName}: migration must be "${migration.name}"`)
  }

  const extracted = sqlObjects(migration)
  if (extracted.unsupported) {
    errors.push(`${migration.name}: SQL contains unsupported or dynamic syntax`)
  }

  const contractOwners = Array.isArray(contract.owners)
    ? [...new Set(contract.owners)].sort()
    : []
  if (
    contractOwners.length !== owners.length ||
    contractOwners.some((owner, index) => owner !== owners[index])
  ) {
    errors.push(
      `${contractName}: owners must be "${owners.join(', ')}"`,
    )
  }

  if (!Array.isArray(contract.objects) || contract.objects.length === 0) {
    errors.push(`${contractName}: objects must be a non-empty array`)
    return errors
  }

  const representedOwners = new Set()
  const seenObjects = new Set()
  const declaredObjectNames = new Set(
    Array.isArray(contract.objects)
      ? contract.objects.map((object) => object?.name).filter(Boolean)
      : [],
  )
  for (const objectName of extracted.objects) {
    if (!objectOwners.has(objectName)) {
      errors.push(
        `${migration.name}: SQL references unregistered object "${objectName}"`,
      )
    } else if (!declaredObjectNames.has(objectName)) {
      errors.push(
        `${contractName}: SQL object "${objectName}" is missing from the contract`,
      )
    }
  }
  for (const object of contract.objects) {
    const objectName = object?.name
    const objectOwner = object?.owner

    if (
      typeof objectName !== 'string' ||
      !/^[a-z][a-z0-9_]*\.(?:[a-z][a-z0-9_]*|__schema__)$/u.test(objectName) ||
      typeof objectOwner !== 'string'
    ) {
      errors.push(`${contractName}: every object requires a valid name and owner`)
      continue
    }
    if (seenObjects.has(objectName)) {
      errors.push(`${contractName}: duplicate object "${objectName}"`)
      continue
    }
    seenObjects.add(objectName)

    if (!extracted.objects.has(objectName)) {
      errors.push(
        `${contractName}: declared object "${objectName}" is not referenced by the migration SQL`,
      )
    }

    if (!owners.includes(objectOwner)) {
      errors.push(
        `${contractName}: object "${objectName}" owner "${objectOwner}" is not a declared migration owner`,
      )
      continue
    }
    representedOwners.add(objectOwner)

    const manifestOwner = objectOwners.get(objectName)
    if (!manifestOwner) {
      errors.push(
        `${contractName}: object "${objectName}" is missing from docs/schema-ownership.json`,
      )
    } else if (manifestOwner !== objectOwner) {
      errors.push(
        `${contractName}: object "${objectName}" is owned by "${manifestOwner}", not "${objectOwner}"`,
      )
    }
  }

  for (const owner of owners) {
    if (!representedOwners.has(owner)) {
      errors.push(`${contractName}: owner "${owner}" has no declared object`)
    }
  }

  return errors
}

function validateSchemaOwnership(baseMigrations, migrations) {
  const errors = []
  const basePaths = new Set(baseMigrations.map((migration) => migration.path))

  for (const migration of migrations) {
    if (basePaths.has(migration.path)) {
      continue
    }

    const expectedOwners = expectedOwnersFor(migration.description)
    if (!expectedOwners) {
      errors.push(
        `${migration.name}: description must start with a documented schema owner`,
      )
      continue
    }

    const expected = [...expectedOwners].sort()
    const { header, owners } = declaredOwnersFor(migration)
    if (!owners) {
      errors.push(
        `${migration.name}: missing "-- owners: ${expected.join(', ')}" declaration`,
      )
      continue
    }

    if (
      owners.length !== expected.length ||
      owners.some((owner, index) => owner !== expected[index])
    ) {
      errors.push(
        `${migration.name}: declared owners "${owners.join(', ')}" do not match expected owners "${expected.join(', ')}"`,
      )
      continue
    }

    errors.push(...validateTaskContract(migration, owners, header))
  }

  return errors
}

function validateOwnershipManifestHistory(baseCommit) {
  const baseManifest = runGit([
    'show',
    `${baseCommit}:docs/schema-ownership.json`,
  ])
  if (baseManifest.status !== 0) {
    return []
  }

  let parsedBase
  try {
    parsedBase = JSON.parse(baseManifest.stdout)
  } catch {
    return ['base schema ownership manifest is not valid JSON']
  }

  const errors = []
  if (parsedBase.version !== ownershipManifest.version) {
    errors.push('schema ownership manifest version cannot change retroactively')
  }
  for (const [objectName, owner] of Object.entries(parsedBase.objects ?? {})) {
    if (ownershipManifest.objects[objectName] !== owner) {
      errors.push(
        `schema ownership cannot reassign existing object "${objectName}" from "${owner}"`,
      )
    }
  }
  for (const [alias, owners] of Object.entries(parsedBase.descriptionAliases ?? {})) {
    if (
      JSON.stringify(ownershipManifest.descriptionAliases[alias]) !==
      JSON.stringify(owners)
    ) {
      errors.push(`schema ownership alias cannot change retroactively: ${alias}`)
    }
  }
  for (const owner of parsedBase.owners ?? []) {
    if (!ownershipManifest.owners.includes(owner)) {
      errors.push(`schema ownership owner cannot be removed: ${owner}`)
    }
  }
  return errors
}

function main() {
  const options = parseArguments(process.argv.slice(2))
  const directory = migrationDirectory()
  const directoryPathspec = migrationDirectoryPathspec(directory)
  const baseCommit = resolveCommit(resolveBaseRef(options))
  const current = currentMigrations(directory, directoryPathspec)
  const baseMigrations = baseMigrationBlobs(baseCommit, directoryPathspec)
  const errors = [
    ...current.errors,
    ...validateTimestampOrder(current.migrations),
    ...validateBaseHistory(baseMigrations, current.migrations),
    ...validateSchemaOwnership(baseMigrations, current.migrations),
    ...validateOwnershipManifestHistory(baseCommit),
  ]

  if (errors.length > 0) {
    throw new Error(`migration checks failed:\n${errors.map((error) => `- ${error}`).join('\n')}`)
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
