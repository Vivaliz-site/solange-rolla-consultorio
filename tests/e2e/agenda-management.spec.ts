import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from './fixtures'
import { signInDemo } from './demo-auth'

const dbUrl = process.env.DB_URL ?? ''
if (!dbUrl) throw new Error('local Supabase DB_URL is required')
function sql(statement: string): string {
  return execFileSync('psql', [dbUrl, '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement], { encoding: 'utf8' }).trim()
}
function quote(value: string): string { return `'${value.replaceAll("'", "''")}'` }

async function createPersonThroughUi(page: Page, name: string): Promise<string> {
  await page.goto('/pessoas/nova', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Nome civil').fill(name)
  await page.getByLabel('Data de nascimento').fill('1990-01-01')
  await page.getByRole('button', { name: 'Cadastrar paciente' }).click()
  await expect(page).toHaveURL(/\/pessoas$/, { timeout: 15_000 })
  await expect.poll(() => sql(`select id from public.people where civil_name=${quote(name)} order by created_at desc limit 1`)).not.toBe('')
  return sql(`select id from public.people where civil_name=${quote(name)} order by created_at desc limit 1`)
}

async function createAppointmentThroughUi(page: Page, personId: string, startsAtLocal: string): Promise<string> {
  await page.goto('/agenda/gerenciar', { waitUntil: 'domcontentloaded' })
  const form = page.locator('section[aria-labelledby="new-appointment-heading"] form')
  await form.locator('select[name="person_id"]').selectOption(personId)
  await form.locator('select[name="service_id"]').selectOption('d0200000-0000-4000-8000-000000000001')
  await form.locator('input[name="starts_at_local"]').fill(startsAtLocal)
  await form.getByRole('button', { name: 'Criar consulta' }).click()
  await expect(page).toHaveURL(/\/agenda\/gerenciar$/)
  await expect.poll(() => sql(`select id from public.appointments where person_id=${quote(personId)} order by created_at desc limit 1`)).not.toBe('')
  return sql(`select id from public.appointments where person_id=${quote(personId)} order by created_at desc limit 1`)
}

test('staff creates an appointment from browser-created person data', async ({ page }) => {
  const name = `Paciente Agenda ${randomUUID().slice(0, 8)}`
  await signInDemo(page)
  const personId = await createPersonThroughUi(page, name)
  const appointmentId = await createAppointmentThroughUi(page, personId, '2035-01-15T14:00')

  await expect.poll(() => sql(`select count(*) from public.audit_events where action='appointment.created' and entity_id=${quote(appointmentId)}`)).toBe('1')
  expect(sql(`select starts_at::text from public.appointments where id=${quote(appointmentId)}`)).toContain('2035-01-15 17:00:00+00')
})

test('staff requests and completes a reschedule entirely through the UI while preserving policy snapshot', async ({ page }) => {
  const name = `Paciente Reagenda ${randomUUID().slice(0, 8)}`
  await signInDemo(page)
  const personId = await createPersonThroughUi(page, name)
  const appointmentId = await createAppointmentThroughUi(page, personId, '2035-01-16T14:00')
  const beforeSnapshot = sql(`select cancellation_policy_snapshot::text from public.appointments where id=${quote(appointmentId)}`)

  await page.goto('/agenda?view=month&date=2035-01-16', { waitUntil: 'domcontentloaded' })
  const item = page.locator('li.appointment-calendar__item').filter({ hasText: name })
  await item.getByText('Abrir consulta').click()
  let statusForm = item.getByRole('form', { name: 'Ações da consulta' })
  await statusForm.locator('select[name="command"]').selectOption('send_confirmation')
  await statusForm.getByRole('button', { name: 'Aplicar' }).click()
  await expect.poll(() => sql(`select status from public.appointments where id=${quote(appointmentId)}`)).toBe('pending_confirmation')

  await page.goto('/agenda?view=month&date=2035-01-16', { waitUntil: 'domcontentloaded' })
  const pendingItem = page.locator('li.appointment-calendar__item').filter({ hasText: name })
  await pendingItem.getByText('Abrir consulta').click()
  statusForm = pendingItem.getByRole('form', { name: 'Ações da consulta' })
  await statusForm.locator('select[name="command"]').selectOption('request_reschedule')
  await statusForm.getByRole('button', { name: 'Aplicar' }).click()
  await expect.poll(() => sql(`select status from public.appointments where id=${quote(appointmentId)}`)).toBe('reschedule_requested')

  await page.goto('/agenda/gerenciar', { waitUntil: 'domcontentloaded' })
  const article = page.locator('article').filter({ has: page.getByRole('heading', { name: new RegExp(name) }) })
  const form = article.locator('form')
  await form.locator('input[name="starts_at_local"]').fill('2035-01-20T15:00')
  await form.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page).toHaveURL(/\/agenda\/gerenciar$/)
  await expect.poll(() => sql(`select status||'|'||starts_at::text||'|'||policy_version::text from public.appointments where id=${quote(appointmentId)}`)).toContain('rescheduled|2035-01-20 18:00:00+00|1')
  await expect.poll(() => sql(`select count(*) from public.appointment_status_history where appointment_id=${quote(appointmentId)} and from_status='reschedule_requested' and to_status='rescheduled'`)).toBe('1')
  expect(sql(`select cancellation_policy_snapshot::text from public.appointments where id=${quote(appointmentId)}`)).toBe(beforeSnapshot)
})
