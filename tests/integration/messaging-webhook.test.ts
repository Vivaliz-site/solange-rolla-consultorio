import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET, POST, createMessagingWebhookHandler, type WebhookProvider } from '../../src/app/api/webhooks/messaging/[provider]/route'

function providerReturning(event: unknown): WebhookProvider {
  return { verifyWebhook: async () => event as never }
}

describe('messaging webhook route', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('completes the Meta webhook verification challenge with the configured token', async () => {
    vi.stubEnv('WEBHOOK_VERIFY_TOKEN_META_WHATSAPP', 'synthetic-verify-token')
    const response = await GET(
      new Request('https://example.test/api/webhooks/messaging/meta-whatsapp?hub.mode=subscribe&hub.verify_token=synthetic-verify-token&hub.challenge=challenge-123'),
      { params: Promise.resolve({ provider: 'meta-whatsapp' }) },
    )

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('challenge-123')
  })

  it('rejects an invalid Meta webhook verification token', async () => {
    vi.stubEnv('WEBHOOK_VERIFY_TOKEN_META_WHATSAPP', 'synthetic-verify-token')
    const response = await GET(
      new Request('https://example.test/api/webhooks/messaging/meta-whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x'),
      { params: Promise.resolve({ provider: 'meta-whatsapp' }) },
    )

    expect(response.status).toBe(403)
  })

  it('returns not found for unsupported webhook providers', async () => {
    const response = await POST(
      new Request('https://example.test/api/webhooks/messaging/unknown', { method: 'POST', body: '{}' }),
      { params: Promise.resolve({ provider: 'unknown' }) },
    )
    expect(response.status).toBe(404)
  })

  it('fails closed before database access when the Meta signing secret is absent', async () => {
    vi.stubEnv('WEBHOOK_SIGNING_SECRET_META_WHATSAPP', '')
    const response = await POST(
      new Request('https://example.test/api/webhooks/messaging/meta-whatsapp', { method: 'POST', body: '{}' }),
      { params: Promise.resolve({ provider: 'meta-whatsapp' }) },
    )
    expect(response.status).toBe(503)
  })

  it('rejects an invalid signature before persisting anything', async () => {
    let inserts = 0
    const handler = createMessagingWebhookHandler(
      'meta',
      { verifyWebhook: async () => null },
      { insertIfNew: async () => { inserts += 1; return true } },
    )

    const response = await handler(new Request('https://example.test/webhook'), {})

    expect(response.status).toBe(401)
    expect(inserts).toBe(0)
  })

  it('deduplicates the same provider event and uses the provider in the inbox key', async () => {
    const stored: Array<{ provider: string; providerEventId: string }> = []
    const repository = {
      insertIfNew: async (event: { provider: string; providerEventId: string }) => {
        if (stored.some((item) => item.provider === event.provider && item.providerEventId === event.providerEventId)) return false
        stored.push(event)
        return true
      },
    }
    const handler = createMessagingWebhookHandler('meta', providerReturning({ providerEventId: 'evt-1', payload: { status: 'delivered' } }), repository)

    const first = await handler(new Request('https://example.test/webhook'), {})
    const second = await handler(new Request('https://example.test/webhook'), {})

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    await expect(first.json()).resolves.toEqual({ accepted: true, duplicate: false })
    await expect(second.json()).resolves.toEqual({ accepted: true, duplicate: true })
    expect(stored).toEqual([{ provider: 'meta', providerEventId: 'evt-1', payload: { status: 'delivered' } }])
  })

  it('returns a generic bad request for a malformed verified payload', async () => {
    const handler = createMessagingWebhookHandler(
      'meta',
      providerReturning({ providerEventId: '', payload: { status: 'delivered' } }),
      { insertIfNew: async () => true },
    )

    const response = await handler(new Request('https://example.test/webhook'), {})

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'invalid webhook payload' })
  })
})
