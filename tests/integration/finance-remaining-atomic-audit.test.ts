import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/app/(protected)/financeiro/operacoes/actions.ts', 'utf8')

describe('remaining finance audit atomicity contract', () => {
  it('routes every previously split mutation through an atomic RPC', () => {
    for (const rpc of [
      'apply_receivable_adjustment_atomic',
      'create_payable_atomic',
      'create_recurrence_rule_atomic',
      'create_vendor_atomic',
      'create_expense_category_atomic',
    ]) {
      expect(source).toContain(rpc)
    }
  })

  it('does not reintroduce direct writes followed by a separate audit insert', () => {
    expect(source).not.toContain(".from('receivable_adjustments').insert")
    expect(source).not.toContain(".from('payables').insert")
    expect(source).not.toContain(".from('recurrence_rules').insert")
    expect(source).not.toContain(".from('vendors').insert")
    expect(source).not.toContain(".from('expense_categories').insert")
    expect(source).not.toContain(".from('audit_events').insert")
  })

  it('keeps the pre-existing payment/refund/payable-payment atomic RPCs', () => {
    expect(source).toContain('record_receivable_payment_atomic')
    expect(source).toContain('refund_receivable_payment_atomic')
    expect(source).toContain('record_payable_payment_atomic')
  })
})
