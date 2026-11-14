import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  changeAppointmentStatus,
  normalizeCancellationPolicySnapshot,
  type Appointment,
  type AppointmentStatusRepository,
} from '@/modules/appointments/public'
import { recordAuditEvent, type AuditEvent, type AuditEventRepository } from '@/modules/audit/public'
import {
  completeAppointmentWithHandoff,
  getClinicalRecord,
  HANDOFF_TASK_TYPES,
  serializeSessionEvolution,
  type AssigneeDirectory,
  type ClinicalRecord,
  type ClinicalRecordInsert,
  type HandoffInput,
  type HandoffTaskType,
} from '@/modules/clinical/public'
import { CareSessionEditor } from '@/modules/clinical/ui/care-session-editor'
import { ClinicalHistory, type ReadableClinicalRecord } from '@/modules/clinical/ui/clinical-history'
import {
  AuthorizationError,
  authorizeStaffPermission,
  getStaffSession,
  isActiveStaffWithRole,
  listActiveStaffByRole,
  type StaffDirectoryRepository,
} from '@/modules/identity/public'
import type { Task, TaskRepository } from '@/modules/tasks/public'
import { createSensitiveDataCrypto } from '@/platform/crypto/aes-gcm'
import { createServerSupabaseClient } from '@/platform/supabase/server'
import type { Database } from '@/platform/supabase/types'
import { PageHeader } from '@/shared/ui/page-header'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

function isHandoffTaskType(value: string): value is HandoffTaskType {
  return (HANDOFF_TASK_TYPES as readonly string[]).includes(value)
}

function ageFrom(date: string) {
  const birth = new Date(`${date}T12:00:00Z`)
  const now = new Date()
  let age = now.getUTCFullYear() - birth.getUTCFullYear()
  if (now.getUTCMonth() < birth.getUTCMonth()
    || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age -= 1
  return Math.max(age, 0)
}

function auditRepository(client: Awaited<ReturnType<typeof createServerSupabaseClient>>): AuditEventRepository {
  return {
    async insert(event: AuditEvent): Promise<void> {
      const { error } = await client.from('audit_events').insert({
        actor_user_id: event.actorId,
        action: event.action,
        entity_type: event.entityType,
        entity_id: event.entityId,
        correlation_id: event.correlationId,
        metadata: event.metadata as Database['public']['Tables']['audit_events']['Insert']['metadata'],
        created_at: event.createdAt,
      })
      if (error) throw new Error('CARE_AUDIT_FAILED')
    },
  }
}

async function requireClinicalSession(returnTo: string, permission: 'clinical.read' | 'clinical.create') {
  const session = await getStaffSession()
  if (!session) notFound()
  if (session.aal !== 'aal2') {
    redirect(`/seguranca?reason=mfa_required&returnTo=${encodeURIComponent(returnTo)}`)
  }
  try {
    return authorizeStaffPermission(session, permission, { aal2: true })
  } catch (error) {
    if (error instanceof AuthorizationError && error.code === 'MFA_REQUIRED') {
      redirect(`/seguranca?reason=mfa_required&returnTo=${encodeURIComponent(returnTo)}`)
    }
    notFound()
  }
}

function toAppointment(row: {
  id: string
  person_id: string
  service_id: string
  starts_at: string
  ends_at: string
  status: string
  policy_version: number
  cancellation_deadline_at: string
  cancellation_policy_snapshot: unknown
}): Appointment {
  return {
    id: row.id,
    personId: row.person_id,
    serviceId: row.service_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status as Appointment['status'],
    policyVersion: row.policy_version,
    cancellationDeadlineAt: row.cancellation_deadline_at,
    cancellationPolicy: normalizeCancellationPolicySnapshot(row.cancellation_policy_snapshot),
  }
}

async function startCareAction(formData: FormData) {
  'use server'
  const appointmentId = String(formData.get('appointment_id') ?? '')
  const session = await requireClinicalSession(`/atendimentos/${appointmentId}`, 'clinical.create')
  const client = await createServerSupabaseClient()
  const { data: row, error } = await client.from('appointments')
    .select('id,person_id,service_id,starts_at,ends_at,status,policy_version,cancellation_deadline_at,cancellation_policy_snapshot')
    .eq('id', appointmentId)
    .single()
  if (error || !row) notFound()
  if (row.status === 'in_progress') redirect(`/atendimentos/${appointmentId}`)
  if (row.status !== 'checked_in') redirect(`/atendimentos/${appointmentId}?error=not_ready`)

  const appointment = toAppointment(row)
  const repository: AppointmentStatusRepository = {
    async updateStatus(id, status) {
      const { data, error: updateError } = await client.rpc('transition_staff_appointment_atomic', {
        p_appointment_id: id,
        p_expected_status: 'checked_in',
        p_command: 'start',
      })
      if (updateError || data !== status) throw new Error('CARE_START_CONFLICT')
      return { ...appointment, status }
    },
  }
  await changeAppointmentStatus(appointment, 'start', repository)
  redirect(`/atendimentos/${appointmentId}`)
}

async function finishCareAction(formData: FormData) {
  'use server'
  const appointmentId = String(formData.get('appointment_id') ?? '')
  const personId = String(formData.get('person_id') ?? '')
  const session = await requireClinicalSession(`/atendimentos/${appointmentId}`, 'clinical.create')
  authorizeStaffPermission(session, 'appointments.complete')

  const rawHandoffType = String(formData.get('handoff_type') ?? '')
  let handoff: HandoffInput | undefined
  if (rawHandoffType) {
    if (!isHandoffTaskType(rawHandoffType)) throw new Error('HANDOFF_TYPE_INVALID')
    authorizeStaffPermission(session, 'tasks.create', { aal2: true })
    authorizeStaffPermission(session, 'tasks.assign', { aal2: true })
    const rawDays = formData.get('handoff_follow_up_days')
    handoff = {
      type: rawHandoffType,
      assignedToUserId: String(formData.get('handoff_assigned_to') ?? ''),
      followUpInDays: rawDays ? Number(rawDays) : undefined,
    }
  }

  const client = await createServerSupabaseClient()
  const { data: row, error } = await client.from('appointments')
    .select('id,person_id,service_id,starts_at,ends_at,status,policy_version,cancellation_deadline_at,cancellation_policy_snapshot')
    .eq('id', appointmentId)
    .single()
  if (error || !row || row.person_id !== personId) notFound()
  if (row.status === 'completed') redirect(`/pessoas/${personId}?status=care_completed`)
  if (row.status !== 'in_progress') redirect(`/atendimentos/${appointmentId}?error=not_in_progress`)

  const { data: existingMetadata, error: metadataError } = await client.rpc('list_clinical_record_metadata', { p_person_id: personId })
  if (metadataError) throw new Error('CARE_CLINICAL_METADATA_FAILED')
  const existingRoot = (existingMetadata ?? []).find((record) => record.appointment_id === appointmentId && !record.supersedes_id)

  if (!existingRoot) {
    const plaintext = serializeSessionEvolution({
      evolution: String(formData.get('evolution') ?? ''),
      themes: String(formData.get('themes') ?? ''),
      interventions: String(formData.get('interventions') ?? ''),
      changes: String(formData.get('changes') ?? ''),
      objectives: String(formData.get('objectives') ?? ''),
      referrals: String(formData.get('referrals') ?? ''),
      nextSteps: String(formData.get('next_steps') ?? ''),
    })
    const repository = {
      async insert(input: ClinicalRecordInsert): Promise<ClinicalRecord> {
        const { data, error: insertError } = await client.rpc('create_clinical_record', {
          p_record_id: input.id,
          p_appointment_id: input.appointmentId,
          p_person_id: input.personId,
          p_author_user_id: input.authorUserId,
          p_ciphertext: input.ciphertext,
          p_iv: input.iv,
          p_auth_tag: input.authTag,
          p_key_version: input.keyVersion,
          ...(input.supersedesId ? { p_supersedes_id: input.supersedesId } : {}),
        })
        const record = data?.[0]
        if (insertError || !record) throw new Error('CARE_CLINICAL_CREATE_FAILED')
        return {
          id: record.id,
          appointmentId: record.appointment_id,
          personId: record.person_id,
          authorUserId: record.author_user_id,
          ciphertext: record.ciphertext,
          iv: record.iv,
          authTag: record.auth_tag,
          keyVersion: record.key_version,
          supersedesId: record.supersedes_id ?? undefined,
          createdAt: record.created_at,
        }
      },
    }
    const staffDirectory: Pick<StaffDirectoryRepository, 'findByUserId'> = {
      async findByUserId(userId) {
        const { data } = await client.from('profiles')
          .select('user_id,role,active')
          .eq('user_id', userId)
          .maybeSingle()
        if (!data) return null
        return { userId: data.user_id, role: data.role, active: data.active }
      },
    }
    const assigneeDirectory: AssigneeDirectory = {
      async isActiveSecretary(userId) {
        return isActiveStaffWithRole(userId, 'secretary', staffDirectory)
      },
    }
    const taskRepository: TaskRepository = {
      async insert(task: Task): Promise<void> {
        const { error: taskError } = await client.from('tasks').insert({
          id: task.id,
          type: task.type,
          title: task.title,
          created_by_user_id: task.createdByUserId,
          assigned_to_user_id: task.assignedToUserId,
          person_id: task.personId,
          appointment_id: task.appointmentId,
          due_at: task.dueAt,
        })
        if (taskError) throw new Error('HANDOFF_TASK_CREATE_FAILED')
      },
    }
    await completeAppointmentWithHandoff({
      appointmentId,
      personId,
      authorUserId: session.userId,
      plaintext,
      handoff,
    }, {
      crypto: createSensitiveDataCrypto(),
      repository,
      taskRepository,
      assigneeDirectory,
    })
  }

  const appointment = toAppointment(row)
  const statusRepository: AppointmentStatusRepository = {
    async updateStatus(id, status) {
      const { data, error: updateError } = await client.rpc('transition_staff_appointment_atomic', {
        p_appointment_id: id,
        p_expected_status: 'in_progress',
        p_command: 'complete',
      })
      if (updateError || data !== status) throw new Error('CARE_COMPLETE_CONFLICT')
      return { ...appointment, status }
    },
  }
  await changeAppointmentStatus(appointment, 'complete', statusRepository)
  redirect(`/pessoas/${personId}?status=care_completed`)
}

async function loadReadableHistory(personId: string, client: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: metadata, error } = await client.rpc('list_clinical_record_metadata', { p_person_id: personId })
  if (error) throw new Error('CARE_CLINICAL_METADATA_FAILED')
  const crypto = createSensitiveDataCrypto()
  const records = await Promise.all((metadata ?? []).map(async (record): Promise<ReadableClinicalRecord> => {
    const decrypted = await getClinicalRecord(record.id, {
      crypto,
      reader: {
        async getEnvelope(id) {
          const { data, error: envelopeError } = await client.rpc('get_clinical_record_envelope', { record_id: id })
          const envelope = data?.[0]
          if (envelopeError || !envelope) return null
          return {
            id: envelope.id,
            appointmentId: envelope.appointment_id,
            personId: envelope.person_id,
            createdAt: envelope.created_at,
            supersedesId: envelope.supersedes_id ?? undefined,
            envelope: {
              alg: 'A256GCM',
              ciphertext: envelope.ciphertext,
              iv: envelope.iv,
              authTag: envelope.auth_tag,
              keyVersion: envelope.key_version,
            },
          }
        },
      },
    })
    return {
      id: decrypted.id,
      appointmentId: decrypted.appointmentId,
      createdAt: decrypted.createdAt,
      supersedesId: decrypted.supersedesId,
      plaintext: decrypted.plaintext,
    }
  }))

  const appointmentIds = [...new Set(records.map((record) => record.appointmentId))]
  if (!appointmentIds.length) return records
  const { data: appointments, error: appointmentError } = await client.from('appointments')
    .select('id,starts_at,service:services!appointments_service_id_fkey(name)')
    .in('id', appointmentIds)
  if (appointmentError) throw new Error('CARE_HISTORY_APPOINTMENTS_FAILED')
  const labels = new Map((appointments ?? []).map((appointment) => [
    appointment.id,
    `${appointment.service?.name ?? 'Atendimento'} · ${dateTime.format(new Date(appointment.starts_at))}`,
  ]))
  return records.map((record) => ({ ...record, appointmentLabel: labels.get(record.appointmentId) }))
}

export default async function CareWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ appointmentId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { appointmentId } = await params
  const session = await requireClinicalSession(`/atendimentos/${appointmentId}`, 'clinical.read')
  const client = await createServerSupabaseClient()
  const { data: appointment, error } = await client.from('appointments')
    .select('id,person_id,starts_at,ends_at,status,person:people!appointments_person_id_fkey(civil_name,preferred_name,birth_date),service:services!appointments_service_id_fkey(name)')
    .eq('id', appointmentId)
    .maybeSingle()
  if (error || !appointment || !appointment.person) notFound()

  const history = await loadReadableHistory(appointment.person_id, client)
  const { data: nearby, error: nearbyError } = await client.from('appointments')
    .select('id,starts_at,status')
    .eq('person_id', appointment.person_id)
    .order('starts_at', { ascending: true })
    .limit(200)
  if (nearbyError) throw new Error('CARE_NEARBY_APPOINTMENTS_FAILED')
  const currentTime = Date.parse(appointment.starts_at)
  const previous = [...(nearby ?? [])].reverse().find((item) => Date.parse(item.starts_at) < currentTime && item.status === 'completed')
  const next = (nearby ?? []).find((item) => Date.parse(item.starts_at) > currentTime && !item.status.startsWith('cancelled'))
  const sessionNumber = (nearby ?? []).filter((item) => item.status === 'completed' && Date.parse(item.starts_at) < currentTime).length + 1
  const search = await searchParams
  const displayName = appointment.person.preferred_name || appointment.person.civil_name
  const canCreate = session.permissions.includes('clinical.create')
  const canComplete = session.permissions.includes('appointments.complete')
  const canHandoff = session.permissions.includes('tasks.create') && session.permissions.includes('tasks.assign')
  const secretaries = canHandoff ? await listActiveStaffByRole('secretary', {
    async listActiveByRole(role) {
      const { data } = await client.from('profiles')
        .select('user_id,display_name')
        .eq('role', role)
        .eq('active', true)
      return (data ?? []).map((profile) => ({ userId: profile.user_id, displayName: profile.display_name }))
    },
    async findByUserId(userId) {
      const { data } = await client.from('profiles')
        .select('user_id,role,active')
        .eq('user_id', userId)
        .maybeSingle()
      if (!data) return null
      return { userId: data.user_id, role: data.role, active: data.active }
    },
  }) : []

  return <>
    <PageHeader
      title={`${displayName} · Sessão ${sessionNumber}`}
      description={`${ageFrom(appointment.person.birth_date)} anos · ${appointment.service?.name ?? 'Atendimento'} · ${dateTime.format(new Date(appointment.starts_at))}`}
      actions={<Link className="ui-button ui-button--outline" href={`/pessoas/${appointment.person_id}`}>Ficha do paciente</Link>}
    />

    {search.error === 'not_ready' ? <p role="alert" className="form-field__error">A Secretaria ainda não registrou a chegada deste paciente.</p> : null}
    {search.error === 'not_in_progress' ? <p role="alert" className="form-field__error">Este atendimento não está em andamento.</p> : null}

    <div className="dashboard-grid">
      <section className="ui-card">
        <h2 className="ui-card__title">Consulta atual</h2>
        <p><strong>Situação:</strong> {appointment.status === 'checked_in' ? 'Paciente aguardando atendimento' : appointment.status === 'in_progress' ? 'Em atendimento' : appointment.status === 'completed' ? 'Realizada' : 'Consulta não iniciada'}</p>
      </section>
      <section className="ui-card">
        <h2 className="ui-card__title">Continuidade</h2>
        <p><strong>Última consulta:</strong> {previous ? dateTime.format(new Date(previous.starts_at)) : 'Primeiro atendimento registrado'}</p>
        <p><strong>Próxima consulta:</strong> {next ? dateTime.format(new Date(next.starts_at)) : 'Ainda não agendada'}</p>
      </section>
    </div>

    {appointment.status === 'checked_in' && canCreate ? <section className="ui-card care-workspace__start">
      <h2 className="ui-card__title">Paciente aguardando</h2>
      <p>Ao iniciar, a Secretaria verá somente “Em atendimento”. Nenhuma informação clínica será compartilhada.</p>
      <form action={startCareAction}>
        <input type="hidden" name="appointment_id" value={appointment.id} />
        <button className="ui-button ui-button--primary" type="submit">Iniciar atendimento</button>
      </form>
    </section> : null}

    <section className="ui-card" aria-labelledby="clinical-history-title">
      <h2 className="ui-card__title" id="clinical-history-title">Histórico clínico</h2>
      <p className="ui-card__description">Consulte as evoluções anteriores sem sair do atendimento atual.</p>
      <ClinicalHistory records={history} />
    </section>

    {appointment.status === 'in_progress' && canCreate && canComplete ? <section className="ui-card" aria-labelledby="current-session-title">
      <h2 className="ui-card__title" id="current-session-title">Atendimento de hoje</h2>
      <CareSessionEditor appointmentId={appointment.id} personId={appointment.person_id} action={finishCareAction} secretaries={secretaries} />
    </section> : null}

    {appointment.status === 'completed' ? <section className="ui-card">
      <h2 className="ui-card__title">Atendimento finalizado</h2>
      <p>O registro desta sessão está preservado no histórico clínico.</p>
      <Link className="ui-button ui-button--primary" href={`/pessoas/${appointment.person_id}`}>Voltar para a ficha</Link>
    </section> : null}
  </>
}
