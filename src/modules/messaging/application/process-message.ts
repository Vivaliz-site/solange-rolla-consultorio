import type { MessagingProvider, ProviderMessage } from '../infrastructure/mock-provider'

export type MessageAttemptRepository = {
  appendAttempt(input: { messageId: string; attemptNumber: number; status: string; errorCode?: string }): Promise<void>
  markSent(messageId: string, providerMessageId?: string): Promise<void>
  markFailed(messageId: string): Promise<void>
}
export type RetryQueue = { requeue(delaySeconds: number): Promise<void> }

export async function processMessage(input: { messageId: string; attemptNumber: number; message: ProviderMessage }, dependencies: { provider: MessagingProvider; attempts: MessageAttemptRepository; retryQueue: RetryQueue }): Promise<'sent' | 'retry' | 'failed'> {
  try {
    const result = await dependencies.provider.send(input.message)
    await dependencies.attempts.appendAttempt({ messageId: input.messageId, attemptNumber: input.attemptNumber, status: result.status })
    if (result.accepted) { await dependencies.attempts.markSent(input.messageId, result.externalId); return 'sent' }
    await dependencies.attempts.markFailed(input.messageId)
    return 'failed'
  } catch (error) {
    const transient = error instanceof Error && /429|5\d\d|timeout|abort|transient/i.test(error.message)
    await dependencies.attempts.appendAttempt({ messageId: input.messageId, attemptNumber: input.attemptNumber, status: 'failed', errorCode: error instanceof Error ? error.message : 'UNKNOWN' })
    if (transient && input.attemptNumber < 5) {
      await dependencies.retryQueue.requeue(2 ** input.attemptNumber)
      return 'retry'
    }
    await dependencies.attempts.markFailed(input.messageId)
    return 'failed'
  }
}
