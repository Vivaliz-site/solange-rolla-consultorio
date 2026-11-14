import { expect, it } from 'vitest'
import { ingestProviderEvent } from './ingest-provider-event'

it('deduplicates provider events before processing', async () => {
  let inserts = 0
  const repository = { insertIfNew: async () => { inserts += 1; return inserts === 1 } }
  expect(await ingestProviderEvent({ provider: 'mock', providerEventId: 'evt-1', payload: {} }, repository)).toEqual({ duplicate: false })
  expect(await ingestProviderEvent({ provider: 'mock', providerEventId: 'evt-1', payload: {} }, repository)).toEqual({ duplicate: true })
})

it('keeps an early delivery event pending until provider message correlation exists', async () => {
  let processed = 0
  let processorCalls = 0
  const repository = {
    insertIfNew: async () => true,
    applyDeliveryStatus: async () => 'unknown' as const,
    markProcessed: async () => { processed += 1 },
  }

  const result = await ingestProviderEvent(
    {
      provider: 'meta-whatsapp',
      providerEventId: 'evt-early',
      payload: {
        kind: 'delivery_status',
        providerMessageId: 'wamid.early',
        status: 'delivered',
      },
      delivery: { messageId: 'wamid.early', status: 'delivered' },
    },
    repository,
    async () => { processorCalls += 1 },
  )

  expect(result).toEqual({ duplicate: false })
  expect(processed).toBe(0)
  expect(processorCalls).toBe(0)
})
