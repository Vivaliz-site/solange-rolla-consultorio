import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  calendarRange,
  changeAppointmentStatus,
  availableAppointmentCommands,
  normalizeCancellationPolicySnapshot,
  type CalendarView,
  type Appointment,
  type AppointmentStatusRepository,
  type AppointmentCommand,
} from '@/modules/appointments/public'
import {
  buildAppointmentCharge,
  createReceivableIdempotent,
  type ReceivableRepository,
  type ChargeableAppointment,
} from '@/modules/receivables/public'
import { recordAuditEvent, type AuditEvent, type AuditEventRepository } from '@/modules/audit/public'
import { AppointmentCalendar, type AppointmentCalendarItem } from '@/modules/appointments/ui/calendar'
import {
  authorizeStaffPermission,
  getStaffSession,
  hasSessionPermission,
  type AppPermission,
  type StaffSession,
} from '@/modules/identity/public'
import { createServerSupabaseClient } from '@/platform/supabase/server'
import { PageHeader } from '@/shared/ui/page-header'
import type { Database } from '@/platform/supabase/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const dateOnly = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
})

function normalizeView(value?: string): CalendarView {
  return value === 'day' || value === 'month' ? value : 'week'
}

function normalizeDate(value?: string): string {
  const fallback = dateOnly.format(new Date())
  if (!value) return fallback
  try { calendarRange('day', value); return value } catch { return fallback }
}

function permissionForCommand(command: AppointmentCommand): AppPermission {
  switch (command) {
    case 'send_confirmation':
    case 'confirm':
      return 'appointments.confirm'
    case 'check_in':
      return 'appointments.checkin'
    case 'request_reschedule':
    case 'reschedule':
      return 'appointments.reschedule'
    case 'cancel_in_time':
    case 'cancel_late':
    case 'cancel_by_provider':
      return 'appointments.cancel'
    case 'mark_no_show':
      return 'appointments.no_show'
    case 'complete':
      return 'appointments.complete'
    case 'start':
      return 'clinical.create'
  }
}

function commandsFor(session: StaffSession, status: Appointment['status']) {
  return availableAppointmentCommands(status).filter((command) => hasSessionPermission(session, permissionForCommand(command)))
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
      if (error) throw new Error('AGENDA_AUDIT_FAILED')
    },
  }
}

function redirectBackTo(formData: FormData): string {
  const value = String(formData.get('redirect_to') ?? '')
  return value.startsWith('/agenda') ? value : '/agenda'
}

async function changeAppointmentStatusAction(formData: FormData) {
  'use server'
  const command = String(formData.get('command') ?? '') as AppointmentCommand
  const permission = permissionForCommand(command)
  const session = await getStaffSession()
  authorizeStaffPermission(session, permission)
  const client = await createServerSupabaseClient()
  const appointmentId = String(formData.get('appointment_id') ?? '')
  const redirectTo = redirectBackTo(formData)

  const { data: row, error: readError } = await client
    .from('appointments')
    .select('id,person_id,service_id,starts_at,ends_at,status,policy_version,cancellation_deadline_at,cancellation_policy_snapshot')
    .eq('id', appointmentId)
    .single()
  if (readError || !row) throw new Error('AGENDA_APPOINTMENT_NOT_FOUND')

  const appointment: Appointment = {
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

  const repository: AppointmentStatusRepository = {
    async updateStatus(id, status) {
      const { data, error } = await client.rpc('transition_staff_appointment_atomic', {
        p_appointment_id: id,
        p_expected_status: appointment.status,
        p_command: command,
      })
      if (error || data !== status) throw new Error('AGENDA_STATUS_UPDATE_FAILED')
      return { ...appointment, status }
    },
  }
  await changeAppointmentStatus(appointment, command, repository)
  redirect(redirectTo)
}

async function chargeAppointmentAction(formData: FormData) {
  'use server'
  const session = await getStaffSession()
  const authorized = authorizeStaffPermission(session, 'finance.receive')
  const client = await createServerSupabaseClient()
  const appointmentId = String(formData.get('appointment_id') ?? '')
  const redirectTo = redirectBackTo(formData)

  const { data: row, error: readError } = await client
    .from('appointments')
    .select('id,person_id,status,cancellation_policy_snapshot,service:services!appointments_service_id_fkey(price_cents)')
    .eq('id', appointmentId)
    .single()
  if (readError || !row) throw new Error('AGENDA_APPOINTMENT_NOT_FOUND')
  if (row.status !== 'no_show' && row.status !== 'cancelled_late') throw new Error('AGENDA_APPOINTMENT_NOT_CHARGEABLE')

  const policy = normalizeCancellationPolicySnapshot(row.cancellation_policy_snapshot)
  const chargeable: ChargeableAppointment = {
    id: row.id,
    status: row.status,
    personId: row.person_id,
    payerPersonId: row.person_id,
    noShowChargeEnabled: policy.noShowChargeEnabled,
    lateCancellationChargeEnabled: policy.lateCancellationChargeEnabled,
  }
  const servicePriceCents = row.service?.price_cents
  if (typeof servicePriceCents !== 'number' || !Number.isInteger(servicePriceCents) || servicePriceCents <= 0) {
    throw new Error('AGENDA_SERVICE_PRICE_INVALID')
  }
  const charge = buildAppointmentCharge(chargeable, servicePriceCents)

  if (charge) {
    const repository: ReceivableRepository = {
      async findByIdempotencyKey(key) {
        const { data, error } = await client.from('receivables')
          .select('id,source_type,source_id,person_id,payer_person_id,original_amount_cents')
          .eq('idempotency_key', key)
          .maybeSingle()
        if (error) throw new Error('AGENDA_CHARGE_LOOKUP_FAILED')
        if (!data) return null
        return {
          id: data.id,
          sourceType: data.source_type,
          sourceId: data.source_id,
          personId: data.person_id,
          payerPersonId: data.payer_person_id,
          originalAmountCents: data.original_amount_cents,
          adjustmentCents: 0,
          paidCents: 0,
        }
      },
      async insert(receivable) {
        const { data, error } = await client.from('receivables').insert({
          source_type: receivable.sourceType,
          source_id: receivable.sourceId,
          person_id: receivable.personId,
          payer_person_id: receivable.payerPersonId,
          original_amount_cents: receivable.originalAmountCents,
          idempotency_key: receivable.idempotencyKey,
        }).select('id,source_type,source_id,person_id,payer_person_id,original_amount_cents').single()
        if (error?.code === '23505') {
          const { data: existing, error: reselectError } = await client.from('receivables')
            .select('id,source_type,source_id,person_id,payer_person_id,original_amount_cents')
            .eq('idempotency_key', receivable.idempotencyKey)
            .single()
          if (reselectError || !existing) throw new Error('AGENDA_CHARGE_CREATE_FAILED')
          return {
            id: existing.id,
            sourceType: existing.source_type,
            sourceId: existing.source_id,
            personId: existing.person_id,
            payerPersonId: existing.payer_person_id,
            originalAmountCents: existing.original_amount_cents,
            adjustmentCents: 0,
            paidCents: 0,
          }
        }
        if (error || !data) throw new Error('AGENDA_CHARGE_CREATE_FAILED')
        return {
          id: data.id,
          sourceType: data.source_type,
          sourceId: data.source_id,
          personId: data.person_id,
          payerPersonId: data.payer_person_id,
          originalAmountCents: data.original_amount_cents,
          adjustmentCents: 0,
          paidCents: 0,
        }
      },
    }
    const receivable = await createReceivableIdempotent(charge, repository)
    await recordAuditEvent({
      actorId: authorized.userId,
      action: 'receivable.appointment_charge_created',
      entityType: 'receivable',
      entityId: receivable.id,
      correlationId: appointmentId,
      metadata: { appointmentId, appointmentStatus: row.status, amountCents: charge.amountCents },
    }, auditRepository(client))
  }

  redirect(redirectTo)
}

export default async function AgendaPage({ searchParams }: {
  searchParams: Promise<{ view?: string; date?: string }>
}) {
  const session = await getStaffSession()
  if (!session) redirect('/login')
  authorizeStaffPermission(session, 'appointments.read')

  const query = await searchParams
  const view = normalizeView(query.view)
  const anchor = normalizeDate(query.date)
  const range = calendarRange(view, anchor)
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('appointments')
    .select('id,person_id,starts_at,ends_at,status,cancellation_deadline_at,cancellation_policy_snapshot,person:people!appointments_person_id_fkey(civil_name,preferred_name),service:services!appointments_service_id_fkey(name)')
    .gte('starts_at', range.from.toISOString())
    .lt('starts_at', range.to.toISOString())
    .order('starts_at', { ascending: true })

  if (error) throw new Error('AGENDA_READ_FAILED')

  const redirectTo = `/agenda?view=${view}&date=${anchor}`
  const items: AppointmentCalendarItem[] = (data ?? []).map((row) => {
    const policy = normalizeCancellationPolicySnapshot(row.cancellation_policy_snapshot)
    return {
      id: row.id,
      personId: row.person_id,
      patientName: row.person?.preferred_name || row.person?.civil_name || 'Paciente',
      serviceName: row.service?.name || 'Consulta',
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status as AppointmentCalendarItem['status'],
      cancellationDeadlineAt: row.cancellation_deadline_at,
      availableCommands: commandsFor(session, row.status as Appointment['status']),
      chargeable: hasSessionPermission(session, 'finance.receive') && (
        row.status === 'no_show'
          ? policy.noShowChargeEnabled
          : row.status === 'cancelled_late'
            ? policy.lateCancellationChargeEnabled
            : false
      ),
      canOpenPatient: hasSessionPermission(session, 'patients.read'),
      canStartCare: hasSessionPermission(session, 'clinical.create') && session.role === 'psychologist_owner' && session.aal === 'aal2',
    }
  })

  return <>
    <PageHeader
      title="Agenda"
      description="Consultas, confirmações e rotina de atendimento no horário de Brasília."
      actions={hasSessionPermission(session, 'appointments.create')
        ? <Link className="ui-button ui-button--primary" href={`/agenda/gerenciar?date=${anchor}`}>Nova consulta</Link>
        : undefined}
    />
    <nav className="calendar-view-switch" aria-label="Visualização da agenda">
      <Link aria-current={view === 'day' ? 'page' : undefined} href={`/agenda?view=day&date=${anchor}`}>Dia</Link>
      <Link aria-current={view === 'week' ? 'page' : undefined} href={`/agenda?view=week&date=${anchor}`}>Semana</Link>
      <Link aria-current={view === 'month' ? 'page' : undefined} href={`/agenda?view=month&date=${anchor}`}>Mês</Link>
    </nav>
    <p className="calendar-anchor"><strong>Data de referência:</strong> {anchor.split('-').reverse().join('/')}</p>
    <AppointmentCalendar
      items={items}
      redirectTo={redirectTo}
      changeStatusAction={changeAppointmentStatusAction}
      chargeAction={chargeAppointmentAction}
    />
  </>
}
