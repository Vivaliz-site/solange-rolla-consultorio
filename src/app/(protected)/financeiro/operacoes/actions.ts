'use server'

import { redirect } from 'next/navigation'
import { authorizeStaffSession, getStaffSession } from '@/modules/identity/public'
import { createServerSupabaseClient } from '@/platform/supabase/server'

const PAYMENT_METHODS = new Set(['pix', 'cash', 'debit_card', 'credit_card', 'bank_transfer', 'other'])

type FinancialRpc = (name: 'record_receivable_payment_atomic' | 'refund_receivable_payment_atomic' | 'record_payable_payment_atomic' | 'apply_receivable_adjustment_atomic' | 'create_payable_atomic' | 'create_recurrence_rule_atomic' | 'create_vendor_atomic' | 'create_expense_category_atomic', args: Record<string, string | number>) => PromiseLike<{ data: string | null; error: { code: string; message: string } | null }>
function rpcFailure(error: { code: string; message: string }, fallback: string): Error {
  const known = ['PAYMENT_EXCEEDS_BALANCE','FINANCE_REFUND_EXCEEDS_PAYMENT','FINANCE_PAYABLE_PAYMENT_INVALID','FINANCE_IDEMPOTENCY_CONFLICT','FINANCE_RECEIVABLE_NOT_FOUND','FINANCE_PAYMENT_NOT_FOUND','FINANCE_PAYABLE_NOT_FOUND']
  return new Error(known.find((code) => error.message.includes(code)) ?? `${fallback}:${error.code}`)
}
async function financialRpc(client: Awaited<ReturnType<typeof createServerSupabaseClient>>, name: Parameters<FinancialRpc>[0], args: Record<string, string | number>, fallback: string) {
  const rpc = client.rpc.bind(client) as unknown as FinancialRpc
  const { error } = await rpc(name, args)
  if (error) throw rpcFailure(error, fallback)
}
function cents(value: FormDataEntryValue | null): number { const parsed = Math.round(Number(String(value ?? '').replace(',', '.')) * 100); if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('FINANCE_INVALID_AMOUNT'); return parsed }
function text(formData: FormData, key: string): string { const value = String(formData.get(key) ?? '').trim(); if (!value) throw new Error(`FINANCE_${key.toUpperCase()}_REQUIRED`); return value }
async function context(roles: Array<'psychologist_owner' | 'accounting'>) { const session = await getStaffSession(); const authorized = authorizeStaffSession(session, roles); return { authorized, client: await createServerSupabaseClient() } }
export async function recordPaymentAction(formData: FormData) { const { client } = await context(['psychologist_owner']); const receivableId=text(formData,'receivable_id'), method=text(formData,'method'), idempotencyKey=text(formData,'idempotency_key'); const amountCents=cents(formData.get('amount')); if(!PAYMENT_METHODS.has(method)) throw new Error('FINANCE_INVALID_PAYMENT_METHOD'); await financialRpc(client,'record_receivable_payment_atomic',{p_receivable_id:receivableId,p_amount_cents:amountCents,p_method:method,p_idempotency_key:idempotencyKey},'FINANCE_PAYMENT_CREATE_FAILED'); redirect('/financeiro/operacoes') }
export async function applyAdjustmentAction(formData: FormData) { const { client } = await context(['psychologist_owner']); const receivableId = text(formData, 'receivable_id'); const amountCents = cents(formData.get('amount')); const direction = text(formData, 'direction'); const reason = text(formData, 'reason'); if (!['discount','increase'].includes(direction)) throw new Error('FINANCE_ADJUSTMENT_DIRECTION_INVALID'); const adjustmentCents = direction === 'discount' ? -amountCents : amountCents; await financialRpc(client,'apply_receivable_adjustment_atomic',{p_receivable_id:receivableId,p_adjustment_cents:adjustmentCents,p_reason:reason},'FINANCE_ADJUSTMENT_CREATE_FAILED'); redirect('/financeiro/operacoes') }
export async function refundPaymentAction(formData: FormData) { const { client } = await context(['psychologist_owner']); const paymentId=text(formData,'payment_id'), reason=text(formData,'reason'), method=text(formData,'method'), idempotencyKey=text(formData,'idempotency_key'); const amountCents=cents(formData.get('amount')); if(!PAYMENT_METHODS.has(method)) throw new Error('FINANCE_INVALID_PAYMENT_METHOD'); await financialRpc(client,'refund_receivable_payment_atomic',{p_payment_id:paymentId,p_amount_cents:amountCents,p_method:method,p_reason:reason,p_idempotency_key:idempotencyKey},'FINANCE_REFUND_CREATE_FAILED'); redirect('/financeiro/operacoes') }
export async function createPayableAction(formData: FormData) { const { client } = await context(['psychologist_owner','accounting']); const vendorId=text(formData,'vendor_id'), categoryId=text(formData,'category_id'), description=text(formData,'description'), dueDate=text(formData,'due_date'), competence=text(formData,'competence'), idempotencyKey=text(formData,'idempotency_key'); const amountCents=cents(formData.get('amount')); await financialRpc(client,'create_payable_atomic',{p_vendor_id:vendorId,p_category_id:categoryId,p_description:description,p_amount_cents:amountCents,p_due_date:dueDate,p_competence:competence,p_idempotency_key:idempotencyKey},'FINANCE_PAYABLE_CREATE_FAILED'); redirect('/financeiro/operacoes') }
export async function payPayableAction(formData: FormData) { const {client}=await context(['psychologist_owner','accounting']); const payableId=text(formData,'payable_id'), method=text(formData,'method'), idempotencyKey=text(formData,'idempotency_key'); const amountCents=cents(formData.get('amount')); if(!PAYMENT_METHODS.has(method)) throw new Error('FINANCE_INVALID_PAYMENT_METHOD'); await financialRpc(client,'record_payable_payment_atomic',{p_payable_id:payableId,p_amount_cents:amountCents,p_method:method,p_idempotency_key:idempotencyKey},'FINANCE_PAYABLE_PAYMENT_CREATE_FAILED'); redirect('/financeiro/operacoes') }
export async function createRecurrenceAction(formData: FormData) { const {client}=await context(['psychologist_owner','accounting']); const vendorId=text(formData,'vendor_id'), categoryId=text(formData,'category_id'), description=text(formData,'description'), startDate=text(formData,'start_date'), fallback=text(formData,'month_end_fallback'); const amountCents=cents(formData.get('amount')), dayOfMonth=Number(text(formData,'day_of_month')); if(!Number.isInteger(dayOfMonth)||dayOfMonth<1||dayOfMonth>31||!['last_day','reject'].includes(fallback)) throw new Error('FINANCE_RECURRENCE_INVALID'); await financialRpc(client,'create_recurrence_rule_atomic',{p_vendor_id:vendorId,p_category_id:categoryId,p_description:description,p_amount_cents:amountCents,p_start_date:startDate,p_day_of_month:dayOfMonth,p_month_end_fallback:fallback},'FINANCE_RECURRENCE_CREATE_FAILED'); redirect('/financeiro/operacoes') }

export async function createVendorAction(formData: FormData) {
  const { client } = await context(['psychologist_owner', 'accounting'])
  const legalName = text(formData, 'legal_name')
  await financialRpc(client, 'create_vendor_atomic', { p_legal_name: legalName }, 'FINANCE_VENDOR_CREATE_FAILED')
  redirect('/financeiro/operacoes')
}

export async function createExpenseCategoryAction(formData: FormData) {
  const { client } = await context(['psychologist_owner', 'accounting'])
  const name = text(formData, 'name')
  await financialRpc(client, 'create_expense_category_atomic', { p_name: name }, 'FINANCE_EXPENSE_CATEGORY_CREATE_FAILED')
  redirect('/financeiro/operacoes')
}
