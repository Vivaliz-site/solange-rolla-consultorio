'use server'

import { randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { authorizeStaffSession, getStaffSession } from '@/modules/identity/public'
import {
  FORM_FIELD_TYPES,
  startSubmission,
  type FormClassification,
  type FormField,
  type FormFieldType,
  type FormSubmissionHeader,
  type FormTemplateVersion,
} from '@/modules/forms/public'
import { serverEnv } from '@/platform/env/server'
import { issueCapability } from '@/platform/capabilities/issue'
import { createSupabaseCapabilityIssuanceRepository } from '@/platform/capabilities/supabase-issue-capability-repository'
import { createServerSupabaseClient } from '@/platform/supabase/server'
import { createServiceRoleSupabaseClient } from '@/platform/supabase/service-role'
import type { Json } from '@/platform/supabase/types'

export type GenerateFormLinkState = { link?: string; error?: string }

function required(formData: FormData, key: string): string {
  const value = String(formData.get(key) ?? '').trim()
  if (!value) throw new Error(`FORM_${key.toUpperCase()}_REQUIRED`)
  return value
}
function fieldKey(label: string, index: number): string {
  const normalized = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return normalized || `campo_${index}`
}

function readFields(formData: FormData): FormField[] {
  const fields: FormField[] = []
  for (let index = 1; index <= 5; index += 1) {
    const label = String(formData.get(`field_label_${index}`) ?? '').trim()
    if (!label) continue
    const type = String(formData.get(`field_type_${index}`) ?? 'short_text') as FormFieldType
    if (!(FORM_FIELD_TYPES as readonly string[]).includes(type)) throw new Error('FORM_FIELD_TYPE_INVALID')
    const field: FormField = { key: fieldKey(label, index), label, type, required: formData.get(`field_required_${index}`) === 'yes' }
    if (type === 'single_choice' || type === 'multi_choice') {
      const options = String(formData.get(`field_options_${index}`) ?? '').split(',').map((value) => value.trim()).filter(Boolean)
      if (options.length < 2) throw new Error('FORM_FIELD_OPTIONS_REQUIRED')
      field.options = options
    }
    fields.push(field)
  }
  if (fields.length === 0) throw new Error('FORM_AT_LEAST_ONE_FIELD_REQUIRED')
  return fields
}

async function authorized(roles: Array<'psychologist_owner' | 'secretary'>) {
  const session = await getStaffSession()
  return authorizeStaffSession(session, roles)
}
async function audit(actorId: string, action: string, entityType: string, entityId: string, metadata: Record<string, Json | undefined>) {
  const client = await createServerSupabaseClient()
  const { error } = await client.from('audit_events').insert({
    actor_user_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    correlation_id: entityId,
    metadata,
  })
  if (error) throw new Error(`FORM_AUDIT_FAILED:${error.code}`)
}

export async function createFormTemplateAction(formData: FormData) {
  const staff = await authorized(['psychologist_owner'])
  const name = required(formData, 'name')
  const classification = required(formData, 'classification') as FormClassification
  if (!['administrative', 'sensitive'].includes(classification)) throw new Error('FORM_CLASSIFICATION_INVALID')
  const fields = readFields(formData)
  const formSchema: NonNullable<Json> = {
    fields: fields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      ...(field.options ? { options: [...field.options] } : {}),
    })),
  }
  const client = await createServerSupabaseClient()
  const templateId = randomUUID()
  const versionId = randomUUID()
  const { error: templateError } = await client.from('form_templates').insert({ id: templateId, name, active_version: 1 })
  if (templateError) throw new Error(`FORM_TEMPLATE_CREATE_FAILED:${templateError.code}`)
  const { error: versionError } = await client.from('form_template_versions').insert({
    id: versionId,
    template_id: templateId,
    version: 1,
    data_classification: classification,
    schema: formSchema,
  })
  if (versionError) {
    await client.from('form_templates').delete().eq('id', templateId)
    throw new Error(`FORM_TEMPLATE_VERSION_CREATE_FAILED:${versionError.code}`)
  }
  await audit(staff.userId, 'form_template.created', 'form_template', templateId, {
    templateVersionId: versionId,
    classification,
    fieldCount: fields.length,
  })
  redirect('/formularios?created=1')
}

function templateFromRow(row: {
  id: string
  version: number
  data_classification: string
  schema: Json
}): FormTemplateVersion {
  const raw = row.schema && typeof row.schema === 'object' && !Array.isArray(row.schema)
    ? (row.schema as Record<string, unknown>).fields
    : undefined
  const fields = Array.isArray(raw) ? raw as FormField[] : []
  return {
    id: row.id,
    version: row.version,
    classification: row.data_classification as FormClassification,
    fields,
  }
}

function localOrigin(env: ReturnType<typeof serverEnv>, requestHeaders: Headers): string {
  if (env.APP_ENV !== 'local' && env.APP_ENV !== 'test') return env.APP_URL.replace(/\/$/, '')
  const host = requestHeaders.get('host')
  if (!host) return env.APP_URL.replace(/\/$/, '')
  const proto = requestHeaders.get('x-forwarded-proto') || 'http'
  return `${proto}://${host}`
}
export async function generateFormLinkAction(
  _previous: GenerateFormLinkState,
  formData: FormData,
): Promise<GenerateFormLinkState> {
  try {
    const staff = await authorized(['psychologist_owner', 'secretary'])
    const personId = required(formData, 'person_id')
    const templateVersionId = required(formData, 'template_version_id')
    const hours = Number(required(formData, 'expires_hours'))
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw new Error('FORM_LINK_EXPIRY_INVALID')

    const client = await createServerSupabaseClient()
    const capabilityClient = createServiceRoleSupabaseClient()
    const [{ data: person }, { data: templateRow, error: templateError }] = await Promise.all([
      client.from('people').select('id').eq('id', personId).maybeSingle(),
      client.from('form_template_versions').select('id,version,data_classification,schema').eq('id', templateVersionId).maybeSingle(),
    ])
    if (!person) throw new Error('FORM_PERSON_NOT_FOUND')
    if (templateError || !templateRow) throw new Error('FORM_TEMPLATE_VERSION_NOT_FOUND')

    const template = templateFromRow(templateRow)
    const submissionId = randomUUID()
    const repository = {
      async create(input: FormSubmissionHeader): Promise<FormSubmissionHeader> {
        const { error } = await client.from('form_submissions').insert({
          id: input.id,
          subject_id: input.subjectId,
          template_version_id: input.templateVersionId,
          status: input.status,
        })
        if (error) throw new Error(`FORM_SUBMISSION_CREATE_FAILED:${error.code}`)
        return input
      },
    }
    await startSubmission({ id: submissionId, subjectId: personId, template }, repository)
    const expiresAt = new Date(Date.now() + hours * 3_600_000)
    const issued = await issueCapability({
      purpose: 'form_fill',
      subjectType: 'form_submission',
      subjectId: submissionId,
      expiresAt,
    }, createSupabaseCapabilityIssuanceRepository(capabilityClient))

    await audit(staff.userId, 'form.capability_issued', 'form_submission', submissionId, {
      personId,
      templateVersionId,
      expiresAt: expiresAt.toISOString(),
    })
    const env = serverEnv()
    const origin = localOrigin(env, await headers())
    return { link: `${origin}/c/${issued.rawToken}?purpose=form_fill` }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'FORM_LINK_CREATE_FAILED' }
  }
}
