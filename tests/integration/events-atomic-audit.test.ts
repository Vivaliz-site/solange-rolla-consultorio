import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/app/(protected)/eventos/operacoes/actions.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20261114093000_events_atomic_audit.sql', 'utf8')

describe('event audit atomicity contract', () => {
  it('routes all event operation writes through atomic RPCs', () => {
    for (const rpc of [
      'create_event_atomic',
      'update_event_atomic',
      'register_event_participant_atomic',
      'update_event_registration_atomic',
      'create_event_expense_atomic',
    ]) expect(source).toContain(rpc)
  })

  it('does not reintroduce split business/audit writes in the event action', () => {
    expect(source).not.toContain(".from('events').insert")
    expect(source).not.toContain(".from('events').update")
    expect(source).not.toContain(".from('event_registrations').update")
    expect(source).not.toContain(".from('event_expenses').insert")
    expect(source).not.toContain(".from('receivables').insert")
    expect(source).not.toContain(".from('audit_events').insert")
  })

  it('preserves existing form-state and accounting access', () => {
    expect(source).toContain('RegisterParticipantState')
    expect(source).toContain('revalidatePath')
    expect(source).toContain("ctx(['psychologist_owner','accounting'])")
    expect(migration).toContain("current_app_role() not in ('psychologist_owner','accounting')")
  })

  it('uses the same event-scoped advisory lock for registration and capacity update', () => {
    const lock = "pg_advisory_xact_lock(hashtextextended(p_event_id::text,0))"
    expect(migration.split(lock)).toHaveLength(3)
  })
})
