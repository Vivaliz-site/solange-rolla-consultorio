import 'server-only'
import { createServiceRoleSupabaseClient } from '../../../platform/supabase/service-role'
import type { MessageAttemptRepository } from '../application/process-message'

type MessagingClient = ReturnType<typeof createServiceRoleSupabaseClient>

export function createSupabaseMessageAttemptRepository(client: MessagingClient = createServiceRoleSupabaseClient()): MessageAttemptRepository {
  return {
    async appendAttempt(input: { messageId: string; attemptNumber: number; status: string; errorCode?: string }): Promise<void> {
      const { error } = await client
        .from('message_attempts')
        .upsert({
          outbound_message_id: input.messageId,
          attempt_number: input.attemptNumber,
          provider_status: input.status,
          error_code: input.errorCode ?? null,
        }, { onConflict: 'outbound_message_id,attempt_number' })
      if (error) throw error
    },

    async markSent(messageId: string, providerMessageId?: string): Promise<void> {
      if (providerMessageId) {
        const { data, error } = await client.rpc('record_message_provider_acceptance', {
          p_message_id: messageId,
          p_provider_message_id: providerMessageId,
        })
        if (error) throw error
        if (data !== 'updated') throw new Error('MESSAGE_PROVIDER_ACCEPTANCE_RESULT_INVALID')
        return
      }

      const { error } = await client
        .from('outbound_messages')
        .update({ status: 'sent' })
        .eq('id', messageId)
      if (error) throw error
    },

    async markFailed(messageId: string): Promise<void> {
      const { error } = await client.from('outbound_messages').update({ status: 'failed' }).eq('id', messageId)
      if (error) throw error
    },
  }
}
