import { describe, expect, it } from 'vitest'
import { createSupabaseMessageAttemptRepository } from './supabase-attempt-repository'

type Call = {
  table?: string
  op: string
  values?: unknown
  id?: string
  name?: string
  args?: unknown
}

function fakeClient() {
  const calls: Call[] = []
  const client = {
    async rpc(name: string, args: unknown) {
      calls.push({ op: 'rpc', name, args })
      return { data: 'updated', error: null }
    },
    from(table: string) {
      return {
        upsert(values: unknown, options: unknown) {
          calls.push({ table, op: 'upsert', values })
          return { options, then: undefined } as never
        },
        update(values: unknown) {
          return {
            eq: async (_column: string, id: string) => {
              calls.push({ table, op: 'update', values, id })
              return { error: null }
            },
          }
        },
      }
    },
  }
  return { client, calls }
}

describe('supabase message attempt repository', () => {
  it('upserts an attempt row keyed by message id and attempt number', async () => {
    const { client, calls } = fakeClient()
    const repository = createSupabaseMessageAttemptRepository(client as never)
    await repository.appendAttempt({ messageId: 'm1', attemptNumber: 1, status: 'accepted' })
    expect(calls[0]).toMatchObject({
      table: 'message_attempts', op: 'upsert',
      values: { outbound_message_id: 'm1', attempt_number: 1, provider_status: 'accepted', error_code: null },
    })
  })

  it('records provider acceptance through the atomic reconciliation RPC', async () => {
    const { client, calls } = fakeClient()
    const repository = createSupabaseMessageAttemptRepository(client as never)
    await repository.markSent('m1', 'provider-message-1')
    expect(calls[0]).toEqual({
      op: 'rpc',
      name: 'record_message_provider_acceptance',
      args: { p_message_id: 'm1', p_provider_message_id: 'provider-message-1' },
    })
  })

  it('marks a provider-less outbound message sent directly', async () => {
    const { client, calls } = fakeClient()
    const repository = createSupabaseMessageAttemptRepository(client as never)
    await repository.markSent('m1')
    expect(calls[0]).toMatchObject({
      table: 'outbound_messages',
      op: 'update',
      values: { status: 'sent' },
      id: 'm1',
    })
  })

  it('marks the outbound message failed', async () => {
    const { client, calls } = fakeClient()
    const repository = createSupabaseMessageAttemptRepository(client as never)
    await repository.markFailed('m1')
    expect(calls[0]).toMatchObject({ table: 'outbound_messages', op: 'update', values: { status: 'failed' }, id: 'm1' })
  })
})
