import { redirect } from 'next/navigation'
import {
  authorizeStaffPermission,
  authorizeStaffSession,
  getStaffSession,
  listActiveStaffByRole,
} from '@/modules/identity/public'
import {
  reassignTask,
  updateTaskStatus,
  type Task,
  type TaskStatus,
} from '@/modules/tasks/public'
import { createServerSupabaseClient } from '@/platform/supabase/server'
import { PageHeader } from '@/shared/ui/page-header'
import { DashboardView } from './dashboard-view'
import { buildTaskQueue, type TaskQueueRow } from './task-queue'
import { TaskQueueView } from './task-queue-view'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const DUE_SOON_HORIZON_DAYS = 3

async function taskRepository(client: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  return {
    async findById(id: string): Promise<Task | null> {
      const { data } = await client.from('tasks').select('*').eq('id', id).maybeSingle()
      if (!data) return null
      return {
        id: data.id,
        type: data.type as Task['type'],
        title: data.title,
        status: data.status as TaskStatus,
        createdByUserId: data.created_by_user_id,
        assignedToUserId: data.assigned_to_user_id,
        personId: data.person_id,
        appointmentId: data.appointment_id,
        dueAt: data.due_at,
      }
    },
    async updateStatus(id: string, status: TaskStatus): Promise<void> {
      const { error } = await client.from('tasks').update({ status }).eq('id', id)
      if (error) throw new Error('TASK_STATUS_UPDATE_FAILED')
    },
    async updateAssignee(id: string, assignedToUserId: string | null): Promise<void> {
      const { error } = await client.from('tasks').update({ assigned_to_user_id: assignedToUserId }).eq('id', id)
      if (error) throw new Error('TASK_ASSIGNEE_UPDATE_FAILED')
    },
  }
}

async function completeTaskAction(formData: FormData) {
  'use server'
  const session = await getStaffSession()
  authorizeStaffSession(session, ['secretary', 'psychologist_owner'])
  authorizeStaffPermission(session, 'tasks.update')
  const taskId = String(formData.get('task_id') ?? '')
  const client = await createServerSupabaseClient()
  await updateTaskStatus(taskId, 'done', await taskRepository(client))
  redirect('/dashboard')
}

async function claimTaskAction(formData: FormData) {
  'use server'
  const session = await getStaffSession()
  const authorizedSession = authorizeStaffSession(session, ['secretary', 'psychologist_owner'])
  authorizeStaffPermission(session, 'tasks.update')
  const taskId = String(formData.get('task_id') ?? '')
  const client = await createServerSupabaseClient()
  await reassignTask(taskId, authorizedSession.userId, await taskRepository(client))
  redirect('/dashboard')
}

async function reassignTaskAction(formData: FormData) {
  'use server'
  const session = await getStaffSession()
  authorizeStaffSession(session, ['secretary', 'psychologist_owner'])
  authorizeStaffPermission(session, 'tasks.update')
  authorizeStaffPermission(session, 'tasks.assign')
  const taskId = String(formData.get('task_id') ?? '')
  const assignedToUserId = String(formData.get('assigned_to_user_id') ?? '')
  const client = await createServerSupabaseClient()
  await reassignTask(taskId, assignedToUserId, await taskRepository(client))
  redirect('/dashboard')
}

export default async function DashboardPage() {
  const session = await getStaffSession()
  if (!session) redirect('/login')

  const supabase = await createServerSupabaseClient()
  const now = new Date()
  const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [appointments, receivables, events, people, failedMessages] = await Promise.all([
    supabase.from('appointments').select('id', { count: 'exact', head: true })
      .gte('starts_at', now.toISOString()).lt('starts_at', horizon.toISOString()),
    supabase.from('receivables').select('original_amount_cents,status,payments(amount_cents)')
      .in('status', ['open', 'partial', 'overdue']),
    supabase.from('events').select('id', { count: 'exact', head: true })
      .gte('starts_at', now.toISOString()).neq('status', 'cancelled'),
    supabase.from('people').select('id', { count: 'exact', head: true }),
    supabase.from('outbound_messages').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
  ])

  const firstError = [appointments.error, receivables.error, events.error, people.error, failedMessages.error].find(Boolean)
  if (firstError) throw new Error(`DASHBOARD_READ_FAILED:${firstError.code}`)
  const openReceivablesCents = (receivables.data ?? []).reduce((sum, row) => {
    const paid = (row.payments ?? []).reduce((paidSum, payment) => paidSum + payment.amount_cents, 0)
    return sum + Math.max(0, row.original_amount_cents - paid)
  }, 0)

  const { data: openTasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id,type,title,status,assigned_to_user_id,person_id,appointment_id,due_at')
    .in('status', ['open', 'in_progress'])
  if (tasksError) throw new Error(`DASHBOARD_TASKS_READ_FAILED:${tasksError.code}`)

  const assigneeIds = [...new Set((openTasks ?? []).flatMap((task) => task.assigned_to_user_id ? [task.assigned_to_user_id] : []))]
  const personIds = [...new Set((openTasks ?? []).flatMap((task) => task.person_id ? [task.person_id] : []))]
  const [{ data: assigneeProfiles }, { data: taskPeople }] = await Promise.all([
    assigneeIds.length > 0
      ? supabase.from('profiles').select('user_id,display_name').in('user_id', assigneeIds)
      : Promise.resolve({ data: [] as { user_id: string; display_name: string | null }[] }),
    personIds.length > 0
      ? supabase.from('people').select('id,civil_name,preferred_name').in('id', personIds)
      : Promise.resolve({ data: [] as { id: string; civil_name: string; preferred_name: string | null }[] }),
  ])
  const assigneeNameById = new Map((assigneeProfiles ?? []).map((profile) => [profile.user_id, profile.display_name]))
  const personNameById = new Map((taskPeople ?? []).map((person) => [person.id, person.preferred_name || person.civil_name]))

  const taskQueueRows: TaskQueueRow[] = (openTasks ?? []).map((task) => ({
    id: task.id,
    type: task.type as TaskQueueRow['type'],
    title: task.title,
    status: task.status as TaskStatus,
    assignedToUserId: task.assigned_to_user_id,
    assignedToName: task.assigned_to_user_id ? assigneeNameById.get(task.assigned_to_user_id) ?? null : null,
    personId: task.person_id,
    personName: task.person_id ? personNameById.get(task.person_id) ?? null : null,
    appointmentId: task.appointment_id,
    dueAt: task.due_at,
  }))
  const taskQueue = buildTaskQueue(taskQueueRows, now, DUE_SOON_HORIZON_DAYS)

  const [secretaries, professionals] = await Promise.all([
    listActiveStaffByRole('secretary', {
      async listActiveByRole(role) {
        const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, active').eq('role', role).eq('active', true)
        return (profiles ?? []).map((profile) => ({ userId: profile.user_id, displayName: profile.display_name }))
      },
      async findByUserId() { return null },
    }),
    listActiveStaffByRole('psychologist_owner', {
      async listActiveByRole(role) {
        const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, active').eq('role', role).eq('active', true)
        return (profiles ?? []).map((profile) => ({ userId: profile.user_id, displayName: profile.display_name }))
      },
      async findByUserId() { return null },
    }),
  ])

  return <>
    <PageHeader title="Dashboard" description="Visão operacional do consultório." />
    <DashboardView
      upcomingAppointments={appointments.count ?? 0}
      openReceivablesCents={openReceivablesCents}
      upcomingEvents={events.count ?? 0}
      peopleCount={people.count ?? 0}
      failedMessages={failedMessages.count ?? 0}
      canViewMessaging={session.role === 'psychologist_owner' || session.role === 'secretary'}
    />
    <TaskQueueView
      entries={taskQueue}
      currentUserId={session.userId}
      professionals={[...secretaries, ...professionals]}
      completeAction={completeTaskAction}
      claimAction={claimTaskAction}
      reassignAction={reassignTaskAction}
    />
  </>
}
