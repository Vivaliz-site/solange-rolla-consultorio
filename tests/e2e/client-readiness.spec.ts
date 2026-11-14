import { expect, test } from './fixtures'

const email = process.env.DEMO_LOCAL_EMAIL
const password = process.env.DEMO_LOCAL_PASSWORD

async function signIn(page: import('./fixtures').Page) {
  if (!email || !password) throw new Error('local demo credentials are required')
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

test('local demo owner sees operational dashboard and navigation', async ({ page }) => {
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  // O total do card varia com outros casos E2E; a verificacao aqui cobre o valor formatado, nao um saldo fixo.
  const financeCard = page.getByRole('link', { name: 'Abrir financeiro' })
  await expect(financeCard.locator('strong')).toHaveText(/^R\$\s*[\d.]+,\d{2}$/)
  await expect(page.getByRole('heading', { name: 'Pacientes' }).locator('..').getByText(/\d+ pacientes/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Agenda', exact: true })).toHaveAttribute('href', '/agenda')
  await expect(page.getByRole('link', { name: 'Financeiro', exact: true })).toHaveAttribute('href', '/financeiro')
})
test('local demo owner sees seeded operational surfaces', async ({ page }) => {
  await signIn(page)

  await page.goto('/agenda?view=month&date=2026-08-29')
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible()
  await expect(page.locator('.appointment-calendar__item').first().locator(':scope > div').first().locator('strong')).toHaveText('Ana')

  await page.goto('/financeiro')
  await expect(page.getByRole('heading', { name: 'Financeiro' })).toBeVisible()
  await expect(page.locator('.receivables-list > li strong').filter({ hasText: /^Ana$/ }).first()).toBeVisible()

  await page.goto('/eventos')
  await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible()
  await expect(page.getByText('Encontro Demonstração')).toBeVisible()

  await page.goto('/pessoas')
  await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible()
  await expect(page.locator('.people-results > li strong').filter({ hasText: /^Ana$/ }).first()).toBeVisible()
  await expect(page.getByText('Nome civil: Ana Demonstração', { exact: true })).toBeVisible()
  await page.goto('/fiscal')
  await expect(page.getByRole('heading', { name: 'Fiscal' })).toBeVisible()
  await expect(page.getByText('Documento emitido')).toBeVisible()
  await expect(page.getByLabel('Status: Pronto para revisão')).toBeVisible()

  await page.goto('/relatorios')
  await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible()
  await expect(page.getByText(/1 eventos encontrados/)).toBeVisible()

})
