import { describe, expect, it } from 'vitest'
import { createSupabaseProviderEventRepository } from './supabase-provider-event-repository'

function fakeInsertClient(error: { code: string } | null) {
  const inserted: unknown[] = []
  const client = {
    from(table: string) {
      if (table !== 'inbox_events') throw new Error(`unexpected table ${table}`)
      return {
        async insert(values: unknown) {
          inserted.push(values)
          return { error }
        },
      }
    },
  }
  return { client, inserted }
}

describe('supabase provider event repository', () => {
  it('inserts a new inbox event and reports it as new', async () => {
    const { client, inserted } = fakeInsertClient(null)
    const repository = createSupabaseProviderEventRepository(client as never)
    const result = await repository.insertIfNew({
      provider: 'meta-whatsapp',
      providerEventId: 'evt-1',
      payload: { status: 'delivered' },
    })
    expect(result).toBe(true)
    expect(inserted).toEqual([{
      provider: 'meta-whatsapp',
      provider_event_id: 'evt-1',
      payload: { status: 'delivered' },
    }])
  })

  it('reports a duplicate (provider, provider_event_id) as not new instead of throwing', async () => {
    const { client } = fakeInsertClient({ code: '23505' })
    const repository = createSupabaseProviderEventRepository(client as never)
    await expect(repository.insertIfNew({
      provider: 'meta-whatsapp',
      providerEventId: 'evt-1',
      payload: {},
    })).resolves.toBe(false)
  })

  it('rethrows a non-conflict database error', async () => {
    const { client } = fakeInsertClient({ code: '42501' })
    const repository = createSupabaseProviderEventRepository(client as never)
    await expect(repository.insertIfNew({
      provider: 'meta-whatsapp',
      providerEventId: 'evt-1',
      payload: {},
    })).rejects.toBeTruthy()
  })

  it('delegates delivery ordering to the atomic database function', async () => {
    const calls: unknown[] = []
    const client = {
      async rpc(name: string, args: unknown) {
        calls.push({ name, args })
        return { data: 'updated', error: null }
      },
    }
    const repository = createSupabaseProviderEventRepository(client as never)
    await expect(repository.applyDeliveryStatus?.({
      messageId: 'provider-message-1',
      status: 'failed',
    })).resolves.toBe('updated')
    expect(calls).toEqual([{
      name: 'apply_message_provider_delivery_status',
      args: { p_provider_message_id: 'provider-message-1', p_status: 'failed' },
    }])
  })

  it('marks a successfully processed inbox event without touching its payload', async () => {
    const calls: unknown[] = []
    const client = {
      from(table: string) {
        expect(table).toBe('inbox_events')
        return {
          update(values: unknown) {
            calls.push({ op: 'update', values })
            return {
              eq(column: string, value: string) {
                calls.push({ op: 'eq', column, value })
                return {
                  async eq(column2: string, value2: string) {
                    calls.push({ op: 'eq', column: column2, value: value2 })
                    return { error: null }
                  },
                }
              },
            }
          },
        }
      },
    }
    const repository = createSupabaseProviderEventRepository(client as never)
    await repository.markProcessed?.({ provider: 'meta-whatsapp', providerEventId: 'evt-1' })
    expect(calls[0]).toMatchObject({ op: 'update' })
    expect(calls.slice(1)).toEqual([
      { op: 'eq', column: 'provider', value: 'meta-whatsapp' },
      { op: 'eq', column: 'provider_event_id', value: 'evt-1' },
    ])
  })

  it('rejects nested payload values that cannot be represented as JSON', async () => {
    const { client, inserted } = fakeInsertClient(null)
    const repository = createSupabaseProviderEventRepository(client as never)
    await expect(repository.insertIfNew({
      provider: 'meta-whatsapp',
      providerEventId: 'evt-invalid',
      payload: { nested: { invalid: () => 'not-json' } },
    })).rejects.toThrow('PROVIDER_EVENT_PAYLOAD_NOT_JSON')
    expect(inserted).toEqual([])
  })
})
