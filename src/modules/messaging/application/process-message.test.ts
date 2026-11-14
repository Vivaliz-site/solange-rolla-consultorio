import { describe, expect, it } from 'vitest'
import { processMessage } from './process-message'

describe('message worker', () => {
  const message = { channel: 'email' as const, recipient: 'x@example.test', body: 'Administrativo', idempotencyKey: 'appointment:1' }
  it('retries transient provider failures without changing the logical message', async () => {
    const delays: number[] = []
    const result = await processMessage({ messageId: 'm1', attemptNumber: 1, message }, {
      provider: { send: async () => { throw new Error('provider 503') } },
      attempts: { appendAttempt: async () => {}, markSent: async () => {}, markFailed: async () => {} },
      retryQueue: { requeue: async (delay) => { delays.push(delay) } },
    })
    expect(result).toBe('retry')
    expect(delays).toEqual([2])
    expect(message.idempotencyKey).toBe('appointment:1')
  })

  it('retries a provider-classified transient error even without a bare status-code substring', async () => {
    // Real providers (e.g. the WhatsApp Cloud API transport) throw clean,
    // structured codes like "WHATSAPP_TRANSIENT" rather than embedding a raw
    // HTTP status in the message -- this must be recognized the same way.
    const delays: number[] = []
    const result = await processMessage({ messageId: 'm1', attemptNumber: 1, message }, {
      provider: { send: async () => { throw new Error('WHATSAPP_TRANSIENT') } },
      attempts: { appendAttempt: async () => {}, markSent: async () => {}, markFailed: async () => {} },
      retryQueue: { requeue: async (delay) => { delays.push(delay) } },
    })
    expect(result).toBe('retry')
    expect(delays).toEqual([2])
  })

  it('does not retry a provider-classified permanent rejection', async () => {
    let failed = false
    const result = await processMessage({ messageId: 'm1', attemptNumber: 1, message }, {
      provider: { send: async () => { throw new Error('WHATSAPP_REJECTED') } },
      attempts: { appendAttempt: async () => {}, markSent: async () => {}, markFailed: async () => { failed = true } },
      retryQueue: { requeue: async () => { throw new Error('must not requeue') } },
    })
    expect(result).toBe('failed')
    expect(failed).toBe(true)
  })

  it('persists the provider external id when the provider accepts the message', async () => {
    const marked: Array<{ messageId: string; externalId?: string }> = []
    const result = await processMessage({ messageId: 'm1', attemptNumber: 1, message }, {
      provider: { send: async () => ({ accepted: true, externalId: 'provider-message-1', status: 'accepted' }) },
      attempts: {
        appendAttempt: async () => {},
        markSent: async (messageId, externalId) => { marked.push({ messageId, externalId }) },
        markFailed: async () => {},
      },
      retryQueue: { requeue: async () => { throw new Error('must not requeue') } },
    })
    expect(result).toBe('sent')
    expect(marked).toEqual([{ messageId: 'm1', externalId: 'provider-message-1' }])
  })

  it('does not retry permanent failures after the lease budget', async () => {
    let failed = false
    const result = await processMessage({ messageId: 'm1', attemptNumber: 5, message }, {
      provider: { send: async () => { throw new Error('400 invalid recipient') } },
      attempts: { appendAttempt: async () => {}, markSent: async () => {}, markFailed: async () => { failed = true } },
      retryQueue: { requeue: async () => { throw new Error('must not requeue') } },
    })
    expect(result).toBe('failed')
    expect(failed).toBe(true)
  })
})
