import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from './fixtures'
import { signInDemo } from './demo-auth'

const dbUrl = process.env.DB_URL ?? ''
if (!dbUrl) throw new Error('local Supabase DB_URL is required')
function sql(statement: string) { return execFileSync('psql', [dbUrl, '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement], { encoding: 'utf8' }).trim() }
function q(value: string) { return `'${value.replaceAll("'", "''")}'` }

async function createPerson(page: Page, name: string) {
  await page.goto('/pessoas/nova', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Nome civil').fill(name)
  await page.getByLabel('Data de nascimento').fill('1990-01-01')
  await page.getByRole('button', { name: 'Cadastrar paciente' }).click()
  await expect(page).toHaveURL(/\/pessoas$/, { timeout: 15_000 })
  await expect.poll(() => sql(`select id from public.people where civil_name=${q(name)} limit 1`)).not.toBe('')
  return sql(`select id from public.people where civil_name=${q(name)} limit 1`)
}

async function createEvent(page: Page, title: string, capacity: number, price: string) {
  await page.goto('/eventos/operacoes', { waitUntil: 'domcontentloaded' })
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Criar evento' }) })
  await form.locator('input[name="title"]').fill(title)
  await form.locator('input[name="starts_at_local"]').fill('2035-03-10T09:00')
  await form.locator('input[name="ends_at_local"]').fill('2035-03-10T12:00')
  await form.locator('input[name="capacity"]').fill(String(capacity))
  await form.locator('input[name="price"]').fill(price)
  await form.getByRole('button', { name: 'Criar evento' }).click()
  await expect(page).toHaveURL(/\/eventos\/operacoes$/)
  await expect.poll(() => sql(`select id from public.events where title=${q(title)} limit 1`)).not.toBe('')
  return sql(`select id from public.events where title=${q(title)} limit 1`)
}

test('staff creates event, enrolls browser-created participant, creates receivable and marks attendance', async ({ page }) => {
  const personName = `Participante ${randomUUID().slice(0, 8)}`
  const title = `Evento E2E ${randomUUID().slice(0, 6)}`
  await signInDemo(page)
  const personId = await createPerson(page, personName)
  const eventId = await createEvent(page, title, 2, '150.00')

  await page.goto(`/eventos/operacoes?person_q=${encodeURIComponent(personName)}`, { waitUntil: 'domcontentloaded' })
  const card = page.locator('article').filter({ hasText: title })
  const registration = card.locator('form:has(button:has-text("Inscrever participante"))')
  await registration.locator('select[name="person_id"]').selectOption(personId)
  await registration.getByRole('button', { name: 'Inscrever participante' }).click()
  await expect.poll(() => sql(`select id from public.event_registrations where event_id=${q(eventId)} and person_id=${q(personId)}`)).not.toBe('')
  const registrationId = sql(`select id from public.event_registrations where event_id=${q(eventId)} and person_id=${q(personId)}`)
  await expect.poll(() => sql(`select count(*) from public.receivables where source_type='event_registration' and source_id=${q(registrationId)}`)).toBe('1')

  const updateForm = page.locator('form').filter({ has: page.locator(`input[name="registration_id"][value="${registrationId}"]`) })
  await updateForm.locator('select[name="status"]').selectOption('confirmed')
  await updateForm.locator('select[name="attendance_status"]').selectOption('present')
  await updateForm.getByRole('button', { name: 'Atualizar inscrição' }).click()
  await expect.poll(() => sql(`select status||'|'||attendance_status from public.event_registrations where id=${q(registrationId)}`)).toBe('confirmed|present')
  await expect.poll(() => sql(`select count(*) from public.audit_events where action='event.registration_updated' and entity_id=${q(registrationId)}`)).toBe('1')
})

test('capacity is enforced atomically and explained in the UI', async ({ page }) => {
  const firstName = `Lotação A ${randomUUID().slice(0, 8)}`
  const secondName = `Lotação B ${randomUUID().slice(0, 8)}`
  const title = `Evento Lotação ${randomUUID().slice(0, 6)}`
  await signInDemo(page)
  const firstId = await createPerson(page, firstName)
  const secondId = await createPerson(page, secondName)
  const eventId = await createEvent(page, title, 1, '0')

  await page.goto(`/eventos/operacoes?person_q=${encodeURIComponent(firstName)}`, { waitUntil: 'domcontentloaded' })
  let card = page.locator('article').filter({ hasText: title })
  let registration = card.locator('form:has(button:has-text("Inscrever participante"))')
  await registration.locator('select[name="person_id"]').selectOption(firstId)
  await registration.getByRole('button', { name: 'Inscrever participante' }).click()
  await expect.poll(() => sql(`select count(*) from public.event_registrations where event_id=${q(eventId)} and status<>'cancelled'`)).toBe('1')

  await page.goto(`/eventos/operacoes?person_q=${encodeURIComponent(secondName)}`, { waitUntil: 'domcontentloaded' })
  card = page.locator('article').filter({ hasText: title })
  registration = card.locator('form:has(button:has-text("Inscrever participante"))')
  await registration.locator('select[name="person_id"]').selectOption(secondId)
  await registration.getByRole('button', { name: 'Inscrever participante' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'atingiu a capacidade' })).toContainText('atingiu a capacidade')
  expect(sql(`select count(*) from public.event_registrations where event_id=${q(eventId)} and status<>'cancelled'`)).toBe('1')
})
