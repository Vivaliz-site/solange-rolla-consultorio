import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = 'supabase/migrations/20261114074500_appointment_status_atomic_audit.sql'
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''
const agenda = readFileSync('src/app/(protected)/agenda/page.tsx', 'utf8')
const care = readFileSync('src/app/(clinical)/atendimentos/[appointmentId]/page.tsx', 'utf8')
const publicRuntime = readFileSync('src/app/(capability)/appointment-runtime.ts', 'utf8')

describe('atomic appointment status and audit #209', () => {
  it('uses a single transaction with a row lock for status, history and audit', () => {
    expect(migration).toMatch(/create or replace function public\.transition_staff_appointment_atomic/i)
    expect(migration).toMatch(/for update;/i)
    expect(migration).toContain('insert into public.appointment_status_history')
    expect(migration).toContain('insert into public.audit_events')
    expect(migration).toContain('auth.uid()')
    expect(migration).toContain('security invoker')
  })

  it('routes agenda and clinical start and completion through the same RPC', () => {
    expect(agenda).toContain("rpc('transition_staff_appointment_atomic'")
    expect(care.match(/rpc\('transition_staff_appointment_atomic'/g)).toHaveLength(2)
    expect(agenda).not.toContain(".from('appointments').update({ status })")
    expect(care).not.toContain('.update({ status })')
  })

  it('preserves the existing public confirmation RPC as an independent capability flow', () => {
    expect(publicRuntime).toContain("rpc('persist_appointment_response'")
  })

  it('does not grant the new staff RPC to anonymous users', () => {
    expect(migration).toMatch(/revoke all on function public\.transition_staff_appointment_atomic[^;]*from public,\s*anon/i)
    expect(migration).toMatch(/grant execute on function public\.transition_staff_appointment_atomic[^;]*to authenticated/i)
  })
})
