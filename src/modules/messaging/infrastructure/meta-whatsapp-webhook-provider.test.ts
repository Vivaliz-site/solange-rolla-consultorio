import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createMetaWhatsAppWebhookProvider } from './meta-whatsapp-webhook-provider'

function signedRequest(body: string, secret: string, signatureOverride?: string) {
  const signature = signatureOverride ?? `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
  return new Request('https://example.test/api/webhooks/messaging/meta', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body,
  })
}

describe('meta whatsapp webhook provider', () => {
  const secret = 'synthetic-meta-app-secret-32-bytes-minimum'
  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'wamid.synthetic.1', status: 'delivered', timestamp: '1' }] } }] }],
  })

  it('verifies a real Meta-style HMAC and extracts delivery correlation', async () => {
    const provider = createMetaWhatsAppWebhookProvider({ appSecret: secret })
    const event = await provider.verifyWebhook(signedRequest(payload, secret))
    expect(event?.providerEventId).toMatch(/^[a-f0-9]{64}$/)
    expect(event?.delivery).toEqual({ messageId: 'wamid.synthetic.1', status: 'delivered' })
  })

  it('rejects an invalid signature before exposing the payload', async () => {
    const provider = createMetaWhatsAppWebhookProvider({ appSecret: secret })
    await expect(provider.verifyWebhook(signedRequest(payload, secret, 'sha256=' + '0'.repeat(64)))).resolves.toBeNull()
  })

  it('maps provider failed status for terminal reconciliation', async () => {
    const failed = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'wamid.synthetic.2', status: 'failed', timestamp: '2' }] } }] }],
    })
    const provider = createMetaWhatsAppWebhookProvider({ appSecret: secret })
    const event = await provider.verifyWebhook(signedRequest(failed, secret))
    expect(event?.delivery).toEqual({ messageId: 'wamid.synthetic.2', status: 'failed' })
  })
})
