import 'server-only'
import { createServiceRoleSupabaseClient } from '../../../platform/supabase/service-role'
import type { Json } from '../../../platform/supabase/types'
import type { ProviderEvent, ProviderEventRepository } from '../application/ingest-provider-event'

type MessagingClient = ReturnType<typeof createServiceRoleSupabaseClient>

type JsonObject = { [key: string]: Json | undefined }

function toJsonValue(value: unknown): Json | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('PROVIDER_EVENT_PAYLOAD_NOT_JSON')
    return value
  }
  if (Array.isArray(value)) return value.map((item) => {
    const converted = toJsonValue(item)
    if (converted === undefined) throw new Error('PROVIDER_EVENT_PAYLOAD_NOT_JSON')
    return converted
  })
  if (typeof value === 'object') return toJsonObject(value as Record<string, unknown>)
  throw new Error('PROVIDER_EVENT_PAYLOAD_NOT_JSON')
}

function toJsonObject(value: Record<string, unknown>): JsonObject {
  const result: JsonObject = {}
  for (const [key, item] of Object.entries(value)) {
    const converted = toJsonValue(item)
    if (converted !== undefined) result[key] = converted
  }
  return result
}

export function createSupabaseProviderEventRepository(
  client: MessagingClient = createServiceRoleSupabaseClient(),
): ProviderEventRepository {
  return {
    async insertIfNew(event: ProviderEvent): Promise<boolean> {
      const { error } = await client
        .from('inbox_events')
        .insert({
          provider: event.provider,
          provider_event_id: event.providerEventId,
          payload: toJsonObject(event.payload),
        })
      if (error) {
        if (error.code === '23505') return false
        throw error
      }
      return true
    },

    async applyDeliveryStatus(update) {
      const { data, error } = await client.rpc('apply_message_provider_delivery_status', {
        p_provider_message_id: update.messageId,
        p_status: update.status,
      })
      if (error) throw error
      if (data !== 'updated' && data !== 'ignored' && data !== 'unknown') {
        throw new Error('MESSAGE_PROVIDER_DELIVERY_RESULT_INVALID')
      }
      return data
    },

    async markProcessed(event): Promise<void> {
      const { error } = await client
        .from('inbox_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('provider', event.provider)
        .eq('provider_event_id', event.providerEventId)
      if (error) throw error
    },
  }
}
