import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { DeliveryStatus } from '../application/ingest-provider-event'

type MetaWebhookEvent = {
  providerEventId: string
  payload: Record<string, unknown>
  delivery?: {
    messageId: string
    status: DeliveryStatus
  }
}

type MetaStatus = {
  id?: unknown
  status?: unknown
  timestamp?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function signatureMatches(body: string, appSecret: string, signature: string | null): boolean {
  if (!signature?.startsWith('sha256=')) return false
  const receivedHex = signature.slice('sha256='.length)
  if (!/^[a-f0-9]{64}$/iu.test(receivedHex)) return false
  const expected = Buffer.from(createHmac('sha256', appSecret).update(body).digest('hex'), 'hex')
  const received = Buffer.from(receivedHex, 'hex')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

function firstStatus(payload: Record<string, unknown>): MetaStatus | null {
  const entries = Array.isArray(payload.entry) ? payload.entry : []
  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue
    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value) || !Array.isArray(change.value.statuses)) continue
      for (const status of change.value.statuses) {
        if (isRecord(status)) return status
      }
    }
  }
  return null
}

function deliveryStatus(value: unknown): DeliveryStatus | null {
  return value === 'sent' || value === 'delivered' || value === 'read' || value === 'failed'
    ? value
    : null
}

function eventId(parts: string[]): string {
  return createHash('sha256').update(parts.join(':')).digest('hex')
}

export function createMetaWhatsAppWebhookProvider(options: { appSecret: string }) {
  if (!options.appSecret) throw new Error('META_WHATSAPP_WEBHOOK_SECRET_REQUIRED')

  return {
    async verifyWebhook(request: Request): Promise<MetaWebhookEvent | null> {
      const body = await request.text()
      if (!signatureMatches(body, options.appSecret, request.headers.get('x-hub-signature-256'))) return null

      const parsed = JSON.parse(body) as unknown
      if (!isRecord(parsed) || parsed.object !== 'whatsapp_business_account') {
        throw new Error('META_WHATSAPP_WEBHOOK_PAYLOAD_INVALID')
      }

      const status = firstStatus(parsed)
      if (!status) {
        return {
          providerEventId: eventId(['meta-whatsapp', 'unsupported', body]),
          payload: { kind: 'unsupported' },
        }
      }

      const messageId = typeof status.id === 'string' ? status.id : ''
      const mappedStatus = deliveryStatus(status.status)
      if (!messageId || !mappedStatus) throw new Error('META_WHATSAPP_WEBHOOK_STATUS_INVALID')
      const timestamp = typeof status.timestamp === 'string' ? status.timestamp : ''

      return {
        providerEventId: eventId(['meta-whatsapp', messageId, mappedStatus, timestamp]),
        payload: {
          kind: 'delivery_status',
          providerMessageId: messageId,
          status: mappedStatus,
          ...(timestamp ? { timestamp } : {}),
        },
        delivery: { messageId, status: mappedStatus },
      }
    },
  }
}
