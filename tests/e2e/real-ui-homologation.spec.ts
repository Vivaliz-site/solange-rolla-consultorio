import { createHmac, randomUUID } from 'node:crypto'
import { expect, test, type Page } from './fixtures'
import { createClient } from '@supabase/supabase-js'
import { signInDemo } from './demo-auth'
import { runSql } from './db-command'

const dbUrl = process.env.DB_URL ?? ''
if (!dbUrl && process.env.E2E_DB_MODE !== 'supabase-management-api') throw new Error('DB_URL is required for read-only verification and fiscal bootstrap')
function sql(statement: string) { return runSql(statement, dbUrl) }
function q(value: string) { return `'${value.replaceAll("'", "''")}'` }
function validCpf(seed: string) {
  const digits = seed.replace(/\D/g, '').padEnd(9, '1').slice(0, 9).split('').map(Number)
  const check = (base: number[], factor: number) => { const sum = base.reduce((acc, digit, i) => acc + digit * (factor - i), 0); const r = (sum * 10) % 11; return r === 10 ? 0 : r }
  digits.push(check(digits, 10)); digits.push(check(digits, 11)); return digits.join('')
}
function uniquePastAppointmentSlot() {
  const token = randomUUID().replaceAll('-', '')
  const spanMinutes = 180 * 24 * 60
  const offsetMinutes = Number.parseInt(token.slice(0, 8), 16) % spanMinutes
  const instant = new Date(Date.UTC(2026, 1, 1, 8, 0) + offsetMinutes * 60_000)
  const local = instant.toISOString().slice(0, 16)
  return { local, date: local.slice(0, 10) }
}
async function createFiscalPerson(page: Page, name: string, cpf: string) {
  await page.goto('/pessoas/nova', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Nome civil').fill(name); await page.getByLabel('Data de nascimento').fill('1990-01-01'); await page.getByLabel('CPF').fill(cpf)
  await page.getByLabel('Logradouro').fill('Rua Homologação'); await page.getByLabel('Número').fill('100'); await page.getByLabel('Bairro').fill('Centro'); await page.getByLabel('Cidade').fill('Divinópolis'); await page.getByLabel('UF').fill('MG'); await page.getByLabel('CEP').fill('35500000')
  await page.getByRole('button', { name: 'Cadastrar paciente' }).click(); await expect(page).toHaveURL(/\/pessoas$/, { timeout: 15_000 })
  await expect.poll(() => sql(`select id from public.people where civil_name=${q(name)} order by created_at desc limit 1`)).not.toBe('')
  const id = sql(`select id from public.people where civil_name=${q(name)} order by created_at desc limit 1`)
  expect(sql(`select cpf_normalized||'|'||(fiscal_address->>'city')||'|'||(fiscal_address->>'state') from public.people where id=${q(id)}`)).toBe(`${cpf}|Divinópolis|MG`)
  await expect.poll(() => sql(`select action from public.audit_events where entity_type='person' and entity_id=${q(id)} order by created_at desc limit 1`)).toBe('person.created')
  expect(sql(`select metadata->>'fiscalReady' from public.audit_events where entity_type='person' and entity_id=${q(id)} order by created_at desc limit 1`)).toBe('true')
  return id
}
async function createPastAppointmentAndCharge(page: Page, personId: string) {
  const serviceName = `Consulta homologação UI ${randomUUID().slice(0, 8)}`
  await page.goto('/agenda/gerenciar', { waitUntil: 'domcontentloaded' })
  const serviceForm = page.locator('section[aria-labelledby="service-setup-heading"] form')
  await serviceForm.getByLabel('Nome do serviço').fill(serviceName)
  await serviceForm.getByLabel('Duração em minutos').fill('50')
  await serviceForm.getByLabel('Valor da consulta').fill('300.00')
  await serviceForm.getByRole('button', { name: 'Cadastrar serviço' }).click()
  await expect.poll(() => sql(`select id from public.services where name=${q(serviceName)} and active=true order by created_at desc limit 1`)).not.toBe('')
  const serviceId = sql(`select id from public.services where name=${q(serviceName)} and active=true order by created_at desc limit 1`)
  await page.goto('/agenda/gerenciar', { waitUntil: 'domcontentloaded' }); const form = page.locator('section[aria-labelledby="new-appointment-heading"] form')
  const slot = uniquePastAppointmentSlot()
  await form.locator('select[name="person_id"]').selectOption(personId); await form.locator('select[name="service_id"]').selectOption(serviceId); await form.locator('input[name="starts_at_local"]').fill(slot.local); await form.getByRole('button', { name: 'Criar consulta' }).click()
  await expect.poll(() => sql(`select id from public.appointments where person_id=${q(personId)} order by created_at desc limit 1`)).not.toBe(''); const id = sql(`select id from public.appointments where person_id=${q(personId)} order by created_at desc limit 1`)
  await page.goto(`/agenda?view=day&date=${slot.date}`, { waitUntil: 'domcontentloaded' }); const item = page.locator('li.appointment-calendar__item').filter({ has: page.locator(`input[value="${id}"]`) }); await item.getByText('Abrir consulta').click(); const status = item.getByRole('form', { name: 'Ações da consulta' }); await status.locator('select[name="command"]').selectOption('cancel_late'); await status.getByRole('button', { name: 'Aplicar' }).click()
  await expect.poll(() => sql(`select status from public.appointments where id=${q(id)}`)).toBe('cancelled_late'); await page.goto(`/agenda?view=day&date=${slot.date}`, { waitUntil: 'domcontentloaded' }); const charged = page.locator('li.appointment-calendar__item').filter({ hasText: nameFrom(personId) }); await charged.getByText('Abrir consulta').click(); await charged.getByRole('button', { name: 'Registrar cobrança' }).click()
  await expect.poll(() => sql(`select id from public.receivables where source_type='appointment' and source_id=${q(id)} limit 1`)).not.toBe(''); return sql(`select id from public.receivables where source_type='appointment' and source_id=${q(id)} limit 1`)
}
function nameFrom(personId: string) { return sql(`select civil_name from public.people where id=${q(personId)}`) }
async function settleReceivable(page: Page, receivableId: string) {
  await page.goto('/financeiro/operacoes', { waitUntil: 'domcontentloaded' }); let card = page.locator('article').filter({ has: page.locator(`input[name="receivable_id"][value="${receivableId}"]`) }); const original = Number(sql(`select original_amount_cents from public.receivables where id=${q(receivableId)}`)) / 100
  const payment = card.locator('form:has(button:has-text("Registrar pagamento"))'); await payment.locator('input[name="amount"]').fill(original.toFixed(2)); await payment.locator('select[name="method"]').selectOption('pix'); await payment.getByRole('button', { name: 'Registrar pagamento' }).click(); await expect.poll(() => sql(`select count(*) from public.payments where receivable_id=${q(receivableId)}`)).toBe('1'); await expect.poll(() => sql(`select status from public.receivables where id=${q(receivableId)}`)).toBe('paid'); await page.goto('/financeiro/operacoes', { waitUntil: 'domcontentloaded' })
  card = page.locator('article').filter({ has: page.locator(`input[name="receivable_id"][value="${receivableId}"]`) }); const adjustment = card.locator('form:has(button:has-text("Aplicar ajuste"))'); await adjustment.locator('input[name="amount"]').fill('10.00'); await adjustment.locator('select[name="direction"]').selectOption('discount'); await adjustment.locator('input[name="reason"]').fill('Ajuste homologação UI'); await adjustment.getByRole('button', { name: 'Aplicar ajuste' }).click(); await expect.poll(() => sql(`select count(*) from public.receivable_adjustments where receivable_id=${q(receivableId)}`)).toBe('1'); await expect.poll(() => sql(`select status from public.receivables where id=${q(receivableId)}`)).toBe('refund_due'); await page.goto('/financeiro/operacoes', { waitUntil: 'domcontentloaded' })
  const paymentId = sql(`select id from public.payments where receivable_id=${q(receivableId)} order by paid_at desc limit 1`); const refund = page.locator('form').filter({ has: page.locator(`input[name="payment_id"][value="${paymentId}"]`) }); await refund.locator('input[name="amount"]').fill('10.00'); await refund.locator('input[name="reason"]').fill('Estorno homologação UI'); await refund.getByRole('button', { name: 'Registrar estorno' }).click(); await expect.poll(() => sql(`select status from public.receivables where id=${q(receivableId)}`)).toBe('paid')
}
async function createPayable(page: Page, token: string) {
  await page.goto('/financeiro/operacoes', { waitUntil: 'domcontentloaded' }); const vendorName = `Fornecedor UI ${token}`; const categoryName = `Categoria UI ${token}`
  const vendor = page.locator('form').filter({ has: page.getByRole('button', { name: 'Cadastrar fornecedor' }) }); await vendor.getByLabel('Nome do fornecedor').fill(vendorName); await vendor.getByRole('button', { name: 'Cadastrar fornecedor' }).click(); await expect.poll(() => sql(`select id from public.vendors where legal_name=${q(vendorName)} order by created_at desc limit 1`)).not.toBe(''); const vendorId = sql(`select id from public.vendors where legal_name=${q(vendorName)} order by created_at desc limit 1`); await page.goto('/financeiro/operacoes', { waitUntil: 'domcontentloaded' })
  const category = page.locator('form').filter({ has: page.getByRole('button', { name: 'Cadastrar categoria' }) }); await category.getByLabel('Nome da categoria').fill(categoryName); await category.getByRole('button', { name: 'Cadastrar categoria' }).click(); await expect.poll(() => sql(`select id from public.expense_categories where name=${q(categoryName)} limit 1`)).not.toBe(''); const categoryId = sql(`select id from public.expense_categories where name=${q(categoryName)} limit 1`)
  await page.goto('/financeiro/operacoes', { waitUntil: 'domcontentloaded' })
  const create = page.locator('form').filter({ has: page.getByRole('button', { name: 'Criar conta' }) }); await create.locator('select[name="vendor_id"]').selectOption(vendorId); await create.locator('select[name="category_id"]').selectOption(categoryId); await create.locator('input[name="description"]').fill(`Conta UI ${token}`); await create.locator('input[name="amount"]').fill('100.00'); await create.locator('input[name="due_date"]').fill('2035-02-10'); await create.locator('input[name="competence"]').fill('2035-02-01'); await create.getByRole('button', { name: 'Criar conta' }).click(); await expect.poll(() => sql(`select id from public.payables where vendor_id=${q(vendorId)} order by created_at desc limit 1`)).not.toBe(''); const payableId = sql(`select id from public.payables where vendor_id=${q(vendorId)} order by created_at desc limit 1`); await page.goto('/financeiro/operacoes', { waitUntil: 'domcontentloaded' })
  const pay = page.locator('form').filter({ has: page.locator(`input[name="payable_id"][value="${payableId}"]`) }); await pay.locator('input[name="amount"]').fill('100.00'); await pay.getByRole('button', { name: 'Registrar baixa' }).click(); await expect.poll(() => sql(`select status from public.payables where id=${q(payableId)}`)).toBe('paid')
}
async function createEventFlow(page: Page, personId: string, personName: string, token: string) {
  await page.goto('/eventos/operacoes', { waitUntil: 'domcontentloaded' }); const title = `Evento UI ${token}`; const create = page.locator('form').filter({ has: page.getByRole('button', { name: 'Criar evento' }) }); await create.locator('input[name="title"]').fill(title); await create.locator('input[name="starts_at_local"]').fill('2035-03-10T09:00'); await create.locator('input[name="ends_at_local"]').fill('2035-03-10T12:00'); await create.locator('input[name="capacity"]').fill('5'); await create.locator('input[name="price"]').fill('120.00'); await create.getByRole('button', { name: 'Criar evento' }).click(); await expect.poll(() => sql(`select id from public.events where title=${q(title)} limit 1`)).not.toBe(''); const eventId = sql(`select id from public.events where title=${q(title)} limit 1`)
  await page.goto(`/eventos/operacoes?person_q=${encodeURIComponent(personName)}`, { waitUntil: 'domcontentloaded' }); const card = page.locator('article').filter({ hasText: title }); const reg = card.locator('form:has(button:has-text("Inscrever participante"))'); await reg.locator('select[name="person_id"]').selectOption(personId); await reg.getByRole('button', { name: 'Inscrever participante' }).click(); await expect.poll(() => sql(`select id from public.event_registrations where event_id=${q(eventId)} and person_id=${q(personId)}`)).not.toBe(''); const registrationId = sql(`select id from public.event_registrations where event_id=${q(eventId)} and person_id=${q(personId)}`); await page.goto(`/eventos/operacoes?person_q=${encodeURIComponent(personName)}`, { waitUntil: 'domcontentloaded' })
  const refreshedCard = page.locator('article').filter({ hasText: title }); const expense = refreshedCard.locator('form:has(button:has-text("Registrar despesa"))'); await expense.locator('input[name="description"]').fill('Despesa homologação UI'); await expense.locator('input[name="amount"]').fill('35.00'); await expense.locator('select[name="paid"]').selectOption('yes'); await expense.getByRole('button', { name: 'Registrar despesa' }).click(); await expect.poll(() => sql(`select count(*) from public.event_expenses where event_id=${q(eventId)}`)).toBe('1'); await page.goto(`/eventos/operacoes?person_q=${encodeURIComponent(personName)}`, { waitUntil: 'domcontentloaded' })
  const update = page.locator('form').filter({ has: page.locator(`input[name="registration_id"][value="${registrationId}"]`) }); await update.locator('select[name="status"]').selectOption('confirmed'); await update.locator('select[name="attendance_status"]').selectOption('present'); await update.getByRole('button', { name: 'Atualizar inscrição' }).click(); await expect.poll(() => sql(`select attendance_status from public.event_registrations where id=${q(registrationId)}`)).toBe('present'); return registrationId
}
function configuredFiscalProfile() { const id = sql("select id from public.fiscal_profiles where active=true order by version desc limit 1"); if (!id) throw new Error('E2E_FISCAL_PROFILE_NOT_PROVISIONED'); return id }
async function fiscalAndExports(page: Page, personId: string, registrationId: string) {
  const profileId = configuredFiscalProfile(); const treatmentId = sql("select id from public.fiscal_treatments where source_kind='event_registration' order by version desc limit 1")
  await page.goto('/fiscal/operacoes', { waitUntil: 'domcontentloaded' }); const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Emitir NFS-e mock' }) }); await form.locator('select[name="source_type"]').selectOption('event_registration'); await form.locator('input[name="source_id"]').fill(registrationId); await form.locator('select[name="person_id"]').selectOption(personId); await form.locator('select[name="payer_person_id"]').selectOption(personId); await form.locator('input[name="amount"]').fill('120.00'); await form.locator('select[name="profile_id"]').selectOption(profileId); await form.locator('select[name="treatment_id"]').selectOption(treatmentId); await form.locator('input[name="review_ack"]').check(); await form.getByRole('button', { name: 'Emitir NFS-e mock' }).click(); await expect.poll(() => sql(`select id from public.fiscal_documents where source_id=${q(registrationId)} and provider='mock' order by created_at desc limit 1`), { timeout: 15_000 }).not.toBe(''); const docId = sql(`select id from public.fiscal_documents where source_id=${q(registrationId)} and provider='mock' order by created_at desc limit 1`); await page.goto('/fiscal/operacoes', { waitUntil: 'domcontentloaded' }); const cancel = page.locator('form').filter({ has: page.locator(`input[name="fiscal_document_id"][value="${docId}"]`) }); await cancel.locator('input[name="reason"]').fill('Cancelamento homologação UI'); await cancel.getByRole('button', { name: 'Cancelar NFS-e mock' }).click(); await expect.poll(() => sql(`select status from public.fiscal_documents where id=${q(docId)}`)).toBe('cancelled')
  await page.goto('/relatorios/baixar', { waitUntil: 'domcontentloaded' }); for (const [label, ext] of [['Baixar CSV','csv'],['Baixar XLSX','xlsx'],['Baixar PDF','pdf']] as const) { const d = page.waitForEvent('download'); await page.getByRole('button', { name: label }).click(); const download = await d; expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${ext}$`)); expect(await download.path()).toBeTruthy(); await page.goto('/relatorios/baixar', { waitUntil: 'domcontentloaded' }) }
}

test('canonical operational homologation creates all business data through the UI', async ({ page }) => {
  // This end-to-end journey spans independent UI, financial, event, fiscal and export flows.
  // Scope the extra timeout to this test, not to the suite; record the failing phase in CI.
  test.slow()
  const token = randomUUID().slice(0, 8)
  const name = `Homologação UI ${token}`
  const cpf = validCpf(Date.now().toString())

  await test.step('Authenticate demo user', () => signInDemo(page))
  const personId = await test.step('Create fiscal person through UI', () => createFiscalPerson(page, name, cpf))
  const receivableId = await test.step('Create appointment and charge through UI', () => createPastAppointmentAndCharge(page, personId))
  await test.step('Settle receivable and validate refund through UI', () => settleReceivable(page, receivableId))
  await test.step('Create and pay payable through UI', () => createPayable(page, token))
  const registrationId = await test.step('Create event and registration through UI', () => createEventFlow(page, personId, name, token))
  await test.step('Issue mock fiscal document and verify exports', () => fiscalAndExports(page, personId, registrationId))
  await test.step('Verify mobile menu and zoom accessibility', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await page.evaluate(() => { document.documentElement.style.zoom = '2' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    const menuButton = page.getByRole('button', { name: 'Abrir menu' })
    await expect(menuButton).toBeVisible()
    await menuButton.focus()
    await expect(menuButton).toBeFocused()
    const box = await menuButton.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  })
})

test('fiscal validation preserves values entered through the UI', async ({ page }) => {
  const name = `Validação Fiscal ${randomUUID().slice(0, 8)}`
  await signInDemo(page)
  await page.goto('/pessoas/nova', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Nome civil').fill(name)
  await page.getByLabel('Data de nascimento').fill('1991-02-03')
  await page.getByLabel('E-mail').fill('validacao@example.test')
  await page.getByLabel('Logradouro').fill('Rua Parcial')
  await page.getByRole('button', { name: 'Cadastrar paciente' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'CPF' })).toContainText('CPF')
  await expect(page.getByLabel('Nome civil')).toHaveValue(name)
  await expect(page.getByLabel('Data de nascimento')).toHaveValue('1991-02-03')
  await expect(page.getByLabel('E-mail')).toHaveValue('validacao@example.test')
  await expect(page.getByLabel('Logradouro')).toHaveValue('Rua Parcial')
})

async function resetDemoMfa() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  const email = process.env.DEMO_LOCAL_EMAIL
  if (!url || !key || !email) throw new Error('E2E_MFA_BOOTSTRAP_ENV_REQUIRED')
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (usersError) throw usersError
  const user = users.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase())
  if (!user) throw new Error('E2E_MFA_DEMO_USER_NOT_FOUND')
  const { data: factors, error: factorsError } = await admin.auth.admin.mfa.listFactors({ userId: user.id })
  if (factorsError) throw factorsError
  for (const factor of factors.factors) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ userId: user.id, id: factor.id })
    if (error) throw error
  }
}

function decodeBase32(secret: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of secret.replace(/=+$/g, '').toUpperCase()) {
    const index = alphabet.indexOf(char)
    if (index < 0) throw new Error('E2E_MFA_SECRET_INVALID')
    bits += index.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2))
  return Buffer.from(bytes)
}

function totp(secret: string, at = Date.now()): string {
  const counter = Math.floor(at / 30_000)
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3]
  return String(binary % 1_000_000).padStart(6, '0')
}

async function createClinicalAppointment(page: Page, personId: string, token: string) {
  const startOffsetDays = Number.parseInt(token.slice(0, 6), 16) % 3650
  let startsAtLocal = ''
  for (let offset = 0; offset < 3650; offset += 1) {
    const date = new Date(Date.UTC(2050, 0, 1) + (startOffsetDays + offset) * 86_400_000).toISOString().slice(0, 10)
    const dayStart = `${date}T00:00`
    const occupied = sql(`select count(*) from public.appointments where starts_at >= (${q(dayStart)}::timestamp at time zone 'America/Sao_Paulo') and starts_at < ((${q(dayStart)}::timestamp at time zone 'America/Sao_Paulo') + interval '1 day') and status not in ('cancelled','cancelled_late')`)
    if (occupied === '0') { startsAtLocal = `${date}T10:00`; break }
  }
  if (!startsAtLocal) throw new Error('E2E_NO_FREE_CLINICAL_APPOINTMENT_DAY')
  await page.goto('/agenda/gerenciar', { waitUntil: 'domcontentloaded' })
  const form = page.locator('section[aria-labelledby="new-appointment-heading"] form')
  await form.locator('select[name="person_id"]').selectOption(personId)
  await form.locator('select[name="service_id"]').selectOption('d0200000-0000-4000-8000-000000000001')
  await form.locator('input[name="starts_at_local"]').fill(startsAtLocal)
  await form.getByRole('button', { name: 'Criar consulta' }).click()
  await expect.poll(() => sql(`select id from public.appointments where person_id=${q(personId)} order by created_at desc limit 1`)).not.toBe('')
  return sql(`select id from public.appointments where person_id=${q(personId)} order by created_at desc limit 1`)
}

test('owner elevates to AAL2 through the UI, writes a clinical record, and logs out', async ({ page }) => {
  await resetDemoMfa()
  await signInDemo(page)
  const token = randomUUID().replaceAll('-', '').slice(0, 8)
  const name = `Clínico MFA ${token}`
  const personId = await createFiscalPerson(page, name, validCpf(`${Date.now()}7`))
  const appointmentId = await createClinicalAppointment(page, personId, token)
  const appointmentDate = sql(`select to_char(starts_at at time zone 'America/Sao_Paulo','YYYY-MM-DD') from public.appointments where id=${q(appointmentId)}`)
  await page.goto(`/agenda?view=day&date=${appointmentDate}`, { waitUntil: 'domcontentloaded' })
  const appointment = page.locator('li.appointment-calendar__item').filter({ has: page.locator(`input[value="${appointmentId}"]`) })
  await appointment.getByText('Abrir consulta').click()
  const status = appointment.getByRole('form', { name: 'Ações da consulta' })
  await status.locator('select[name="command"]').selectOption('send_confirmation')
  await status.getByRole('button', { name: 'Aplicar' }).click()
  await expect.poll(() => sql(`select status from public.appointments where id=${q(appointmentId)}`)).toBe('pending_confirmation')

  await page.goto(`/agenda?view=day&date=${appointmentDate}`, { waitUntil: 'domcontentloaded' })
  await appointment.getByText('Abrir consulta').click()
  const confirm = appointment.getByRole('form', { name: 'Ações da consulta' })
  await confirm.locator('select[name="command"]').selectOption('confirm')
  await confirm.getByRole('button', { name: 'Aplicar' }).click()
  await expect.poll(() => sql(`select status from public.appointments where id=${q(appointmentId)}`)).toBe('confirmed')

  await page.goto(`/agenda?view=day&date=${appointmentDate}`, { waitUntil: 'domcontentloaded' })
  await appointment.getByText('Abrir consulta').click()
  const checkIn = appointment.getByRole('form', { name: 'Ações da consulta' })
  await checkIn.locator('select[name="command"]').selectOption('check_in')
  await checkIn.getByRole('button', { name: 'Aplicar' }).click()
  await expect.poll(() => sql(`select status from public.appointments where id=${q(appointmentId)}`)).toBe('checked_in')

  await page.goto(`/atendimentos/${appointmentId}`, { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/seguranca\?reason=mfa_required/)
  await page.getByRole('button', { name: 'Configurar autenticador' }).click()
  const secret = await page.getByLabel('Chave secreta').inputValue()
  expect(secret).not.toBe('')
  await page.getByLabel('Código de 6 dígitos').fill(totp(secret))
  await page.getByRole('button', { name: 'Ativar MFA' }).click()
  await expect(page).toHaveURL(new RegExp(`/atendimentos/${appointmentId}$`))
  await page.getByRole('button', { name: 'Iniciar atendimento' }).click()
  await expect.poll(() => sql(`select status from public.appointments where id=${q(appointmentId)}`)).toBe('in_progress')
  await page.getByLabel('Evolução da sessão').fill('Registro clínico sintético de homologação, sem dado real.')
  await page.getByRole('button', { name: 'Finalizar atendimento e registrar evolução' }).click()
  await expect.poll(() => sql(`select count(*) from clinical.records where person_id=${q(personId)}`)).toBe('1')
  await expect.poll(() => sql(`select status from public.appointments where id=${q(appointmentId)}`)).toBe('completed')

  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/login$/)
})

test('staff manages communication preferences and a distinct financial responsible through the UI', async ({ page }) => {
  await signInDemo(page)
  const token = randomUUID().slice(0, 8)
  const seed = Date.now()
  const patientName = `Paciente Preferências ${token}`
  const payerName = `Responsável Financeiro ${token}`
  const patientId = await createFiscalPerson(page, patientName, validCpf(String(seed).slice(-9)))
  const payerId = await createFiscalPerson(page, payerName, validCpf(String(seed + 1).slice(-9)))

  await page.goto(`/pessoas?q=${encodeURIComponent(patientName)}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('link', { name: 'Abrir ficha' }).click()
  await page.getByRole('link', { name: 'Editar cadastro' }).click()
  await page.getByLabel('Canal preferido').selectOption('email')
  await page.getByLabel('Enviar mensagem de aniversário').check()
  await page.getByRole('button', { name: 'Salvar cadastro' }).click()
  await expect(page).toHaveURL(new RegExp(`/pessoas/${patientId}\\?status=updated$`))
  await expect.poll(() => sql(`select preferred_channel||'|'||birthday_messages_enabled::text from public.people where id=${q(patientId)}`)).toBe('email|true')

  await page.getByRole('link', { name: 'Editar cadastro' }).click()
  await page.getByLabel('Tipo de vínculo').selectOption('financial_responsible')
  await page.getByLabel('Pessoa relacionada').selectOption(payerId)
  await page.getByRole('button', { name: 'Adicionar vínculo' }).click()
  await expect(page).toHaveURL(new RegExp(`/pessoas/${patientId}/gerenciar\\?status=relationship_added$`))
  await expect.poll(() => sql(`select related_person_id||'|'||relationship_kind from public.person_relationships where person_id=${q(patientId)} and related_person_id=${q(payerId)} limit 1`)).toBe(`${payerId}|financial_responsible`)
  await expect(page.getByRole('list', { name: 'Vínculos cadastrados' }).getByText(payerName)).toBeVisible()
})

test('staff issues a patient intake capability from the UI and the patient completes it without SQL bootstrap', async ({ page }) => {
  await signInDemo(page)
  const token = randomUUID().slice(0, 8)
  const personName = `Formulário UI ${token}`
  const personId = await createFiscalPerson(page, personName, validCpf(`${Date.now()}9`))

  const templateName = `Pré-consulta UI ${token}`
  await page.goto('/formularios', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Nome do formulário').fill(templateName)
  const field1 = page.getByRole('group', { name: 'Campo 1' })
  await field1.getByLabel('Pergunta 1').fill('Nome completo')
  await field1.getByLabel('Tipo 1').selectOption('short_text')
  await field1.getByRole('checkbox').check()
  const field2 = page.getByRole('group', { name: 'Campo 2' })
  await field2.getByLabel('Pergunta 2').fill('O que gostaria de compartilhar?')
  await field2.getByLabel('Tipo 2').selectOption('long_text')
  await field2.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Criar formulário' }).click()
  await expect(page).toHaveURL(/\/formularios\?created=1$/)

  await page.locator('select[name="person_id"]').selectOption(personId)
  await page.locator('select[name="template_version_id"]').selectOption({ label: `${templateName} · v1` })
  await page.getByLabel('Validade do link em horas').fill('24')
  await page.getByRole('button', { name: 'Gerar link de formulário' }).click()
  const link = await page.locator('input[readonly]').inputValue()
  expect(link).toContain('/c/')
  expect(sql(`select count(*) from public.form_submissions where subject_id=${q(personId)}`)).toBe('1')

  await page.goto(link, { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/formulario$/)
  await page.getByLabel('Nome completo').fill(personName)
  await page.getByLabel('O que gostaria de compartilhar?').fill('Conteúdo sintético inserido pela UI.')
  await page.getByRole('button', { name: 'Revisar respostas' }).click()
  await expect(page).toHaveURL(/\/formulario\/revisao$/)
  await page.getByRole('button', { name: 'Confirmar e continuar' }).click()
  await expect(page).toHaveURL(/\/formulario\/assinar$/)
  const legalCheckboxes = page.getByRole('checkbox')
  await expect(legalCheckboxes).toHaveCount(4)
  for (let index = 0; index < 4; index += 1) await legalCheckboxes.nth(index).check()
  await page.getByLabel('Digite seu nome completo para assinar').fill(personName)
  await page.getByRole('button', { name: 'Confirmar e assinar' }).click()
  await expect(page).toHaveURL(/\/formulario-concluido$/)
  await expect(page.getByRole('heading', { name: 'Formulário enviado e assinado' })).toBeVisible()
  expect(sql(`select status from public.form_submissions where subject_id=${q(personId)} order by created_at desc limit 1`)).toBe('signed')
})
