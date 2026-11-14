import { timingSafeEqual } from 'node:crypto'
import {
  createMetaWhatsAppWebhookProvider,
  createSupabaseProviderEventRepository,
  ingestProviderEvent,
  type ProviderEventRepository,
} from '../../../../../modules/messaging/public'
import { cloneRequestWithBoundedBody } from '../../../../../platform/security/request-limits'

export type WebhookEvent = {
  providerEventId: string
  payload: Record<string, unknown>
  delivery?: {
    messageId: string
    status: 'sent' | 'delivered' | 'read' | 'failed'
  }
}

export type WebhookProvider = {
  verifyWebhook(request: Request): Promise<WebhookEvent | null>
}

export type MessagingWebhookHandler = (request: Request, context?: unknown) => Promise<Response>

function handlerArguments(
  providerOrName: string | WebhookProvider,
  providerOrRepository: WebhookProvider | ProviderEventRepository,
  repository?: ProviderEventRepository,
): { providerName: string; provider: WebhookProvider; repository: ProviderEventRepository } {
  if (typeof providerOrName === 'string') {
    if (!repository || typeof providerOrRepository !== 'object' || !('verifyWebhook' in providerOrRepository)) {
      throw new Error('WEBHOOK_PROVIDER_CONFIGURATION_REQUIRED')
    }
    return { providerName: providerOrName, provider: providerOrRepository, repository }
  }

  if (typeof providerOrRepository !== 'object' || !('insertIfNew' in providerOrRepository)) {
    throw new Error('WEBHOOK_REPOSITORY_CONFIGURATION_REQUIRED')
  }
  return { providerName: 'messaging', provider: providerOrName, repository: providerOrRepository }
}

export function createMessagingWebhookHandler(
  providerName: string,
  provider: WebhookProvider,
  repository: ProviderEventRepository,
): MessagingWebhookHandler
export function createMessagingWebhookHandler(
  provider: WebhookProvider,
  repository: ProviderEventRepository,
): MessagingWebhookHandler
export function createMessagingWebhookHandler(
  providerOrName: string | WebhookProvider,
  providerOrRepository: WebhookProvider | ProviderEventRepository,
  repository?: ProviderEventRepository,
): MessagingWebhookHandler {
  const argumentsForHandler = handlerArguments(providerOrName, providerOrRepository, repository)

  return async function handleMessagingWebhook(request: Request): Promise<Response> {
    let event: WebhookEvent | null
    try {
      const boundedRequest = await cloneRequestWithBoundedBody(request, 'json')
      event = await argumentsForHandler.provider.verifyWebhook(boundedRequest)
    } catch {
      return Response.json({ error: 'invalid webhook payload' }, { status: 400 })
    }

    if (!event) {
      return Response.json({ error: 'invalid webhook signature' }, { status: 401 })
    }

    try {
      const result = await ingestProviderEvent(
        {
          provider: argumentsForHandler.providerName,
          providerEventId: event.providerEventId,
          payload: event.payload,
          delivery: event.delivery,
        },
        argumentsForHandler.repository,
      )
      return Response.json({ accepted: true, duplicate: result.duplicate })
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_PROVIDER_EVENT') {
        return Response.json({ error: 'invalid webhook payload' }, { status: 400 })
      }
      return Response.json({ error: 'webhook unavailable' }, { status: 503 })
    }
  }
}

function sameToken(expected: string, received: string | null): boolean {
  if (!received) return false
  const expectedBytes = Buffer.from(expected, 'utf8')
  const receivedBytes = Buffer.from(received, 'utf8')
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
}

async function providerName(context: { params: Promise<{ provider: string }> }): Promise<string> {
  return (await context.params).provider
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  if (await providerName(context) !== 'meta-whatsapp') {
    return Response.json({ error: 'provider not found' }, { status: 404 })
  }

  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN_META_WHATSAPP
  if (!verifyToken) return Response.json({ error: 'provider not configured' }, { status: 503 })

  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const receivedToken = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  if (mode !== 'subscribe' || !sameToken(verifyToken, receivedToken)) {
    return Response.json({ error: 'invalid webhook verification' }, { status: 403 })
  }
  if (!challenge) return Response.json({ error: 'invalid webhook verification' }, { status: 400 })

  return new Response(challenge, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  if (await providerName(context) !== 'meta-whatsapp') {
    return Response.json({ error: 'provider not found' }, { status: 404 })
  }

  const appSecret = process.env.WEBHOOK_SIGNING_SECRET_META_WHATSAPP
  if (!appSecret) return Response.json({ error: 'provider not configured' }, { status: 503 })

  const handler = createMessagingWebhookHandler(
    'meta-whatsapp',
    createMetaWhatsAppWebhookProvider({ appSecret }),
    createSupabaseProviderEventRepository(),
  )
  return handler(request, context)
}
