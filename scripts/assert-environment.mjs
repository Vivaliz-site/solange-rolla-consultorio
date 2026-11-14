import process from 'node:process'
import { pathToFileURL } from 'node:url'

const environments = new Set(['local', 'test', 'preview', 'staging', 'production'])

function isTrue(value) {
  return value?.toLowerCase() === 'true'
}

export function assertEnvironment(env = process.env) {
  const appEnvironment = env.APP_ENV ?? 'local'
  const errors = []

  if (!environments.has(appEnvironment)) {
    errors.push(`APP_ENV must be one of: ${[...environments].join(', ')}`)
  }

  const projectRef = env.SUPABASE_PROJECT_REF?.trim()
  const productionRef = env.SUPABASE_PRODUCTION_PROJECT_REF?.trim()
  const stagingRef = env.SUPABASE_STAGING_PROJECT_REF?.trim()
  const allowedPreviewRefs = new Set(
    (env.SUPABASE_ALLOWED_PROJECT_REFS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
  const remoteEnvironment = ['preview', 'staging', 'production'].includes(appEnvironment)

  if (remoteEnvironment && !projectRef) {
    errors.push(`${appEnvironment} requires SUPABASE_PROJECT_REF`)
  }
  if (remoteEnvironment && !productionRef) {
    errors.push(`${appEnvironment} requires SUPABASE_PRODUCTION_PROJECT_REF`)
  }
  if (remoteEnvironment && !env.NEXT_PUBLIC_SUPABASE_URL) {
    errors.push(`${appEnvironment} requires NEXT_PUBLIC_SUPABASE_URL`)
  }
  if (remoteEnvironment && !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) {
    errors.push(`${appEnvironment} requires a non-placeholder publishable Supabase key`)
  }
  if (remoteEnvironment && !env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_')) {
    errors.push(`${appEnvironment} requires a server-only Supabase secret key`)
  }
  if (projectRef && productionRef && appEnvironment !== 'production' && projectRef === productionRef) {
    errors.push(`${appEnvironment} must not use the production Supabase project`)
  }
  if (appEnvironment === 'staging' && (!stagingRef || projectRef !== stagingRef)) {
    errors.push('staging must use SUPABASE_STAGING_PROJECT_REF')
  }
  if (appEnvironment === 'production' && projectRef !== productionRef) {
    errors.push('production must use SUPABASE_PRODUCTION_PROJECT_REF')
  }
  if (appEnvironment === 'preview' && (!allowedPreviewRefs.size || !allowedPreviewRefs.has(projectRef))) {
    errors.push('preview project ref must be present in SUPABASE_ALLOWED_PROJECT_REFS')
  }
  if (appEnvironment === 'preview' && (projectRef === productionRef || projectRef === stagingRef)) {
    errors.push('preview must use a dedicated preview Supabase project')
  }
  if (projectRef && stagingRef && appEnvironment === 'production' && projectRef === stagingRef) {
    errors.push('production must not use the staging Supabase project')
  }

  if (remoteEnvironment) {
    try {
      const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL)
      const hostnameParts = url.hostname.split('.')
      const urlProjectRef = hostnameParts.length === 3 && hostnameParts.slice(1).join('.') === 'supabase.co'
        ? hostnameParts[0]
        : undefined
      if (!urlProjectRef || urlProjectRef !== projectRef) {
        errors.push('NEXT_PUBLIC_SUPABASE_URL must identify SUPABASE_PROJECT_REF')
      }
    } catch {
      errors.push('NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase URL')
    }
  }

  const liveProviderEnabled = isTrue(env.WHATSAPP_LIVE_ENABLED) || isTrue(env.EMAIL_LIVE_ENABLED) || isTrue(env.NFSE_LIVE_ENABLED)
  if (appEnvironment === 'local' || appEnvironment === 'test' || appEnvironment === 'preview' || appEnvironment === 'staging') {
    if (liveProviderEnabled) {
      errors.push(`${appEnvironment} live providers must be disabled`)
    }
  }
  if (appEnvironment === 'production' && liveProviderEnabled && env.GO_LIVE_APPROVED !== 'true') {
    errors.push('production live providers require the explicit go-live gate')
  }

  if (appEnvironment === 'production' && isTrue(env.WHATSAPP_LIVE_ENABLED)) {
    for (const name of [
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_PHONE_NUMBER_ID',
      'WEBHOOK_SIGNING_SECRET_META_WHATSAPP',
      'WEBHOOK_VERIFY_TOKEN_META_WHATSAPP',
    ]) {
      if (!env[name]?.trim()) errors.push(`production WhatsApp live requires ${name}`)
    }
  }

  if (errors.length > 0) {
    throw new Error(`environment isolation assertion failed:\n- ${errors.join('\n- ')}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assertEnvironment()
    process.stdout.write('environment isolation assertion passed\n')
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
