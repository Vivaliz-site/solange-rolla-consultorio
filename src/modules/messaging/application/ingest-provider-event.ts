export type ProviderEvent = {
  provider: string
  providerEventId: string
  payload: Record<string, unknown>
  delivery?: ProviderDeliveryUpdate
}

export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed'

export type ProviderDeliveryUpdate = {
  messageId: string
  status: DeliveryStatus
}

export type ProviderEventRepository = {
  insertIfNew(event: ProviderEvent): Promise<boolean>
  applyDeliveryStatus?: (update: ProviderDeliveryUpdate) => Promise<'updated' | 'ignored' | 'unknown'>
  markProcessed?: (event: Pick<ProviderEvent, 'provider' | 'providerEventId'>) => Promise<void>
}

export type ProviderEventProcessor = (event: ProviderEvent) => Promise<void>

export function shouldAdvanceDeliveryStatus(
  current: DeliveryStatus | null | undefined,
  incoming: DeliveryStatus,
): boolean {
  if (!current) return true
  if (current === incoming || current === 'read' || current === 'failed') return false
  if (incoming === 'failed') return current === 'sent'
  if (current === 'sent') return incoming === 'delivered' || incoming === 'read'
  return current === 'delivered' && incoming === 'read'
}

export class InvalidProviderEventError extends Error {
  readonly code = 'INVALID_PROVIDER_EVENT'

  constructor() {
    super('INVALID_PROVIDER_EVENT')
    this.name = 'InvalidProviderEventError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertValidProviderEvent(input: ProviderEvent): void {
  if (
    typeof input.provider !== 'string' || input.provider.trim() === '' ||
    typeof input.providerEventId !== 'string' || input.providerEventId.trim() === '' ||
    !isRecord(input.payload)
  ) {
    throw new InvalidProviderEventError()
  }
}

export async function ingestProviderEvent(
  input: ProviderEvent,
  repository: ProviderEventRepository,
  processNewEvent?: ProviderEventProcessor,
): Promise<{ duplicate: boolean }> {
  assertValidProviderEvent(input)
  const inserted = await repository.insertIfNew(input)
  if (!inserted) return { duplicate: true }

  if (input.delivery && repository.applyDeliveryStatus) {
    const deliveryResult = await repository.applyDeliveryStatus(input.delivery)
    // A provider may emit a delivery webhook before the send worker has
    // persisted provider_message_id. Keep that inbox event unprocessed so
    // record_message_provider_acceptance() can reconcile it atomically later.
    if (deliveryResult === 'unknown') return { duplicate: false }
  }

  await processNewEvent?.(input)
  await repository.markProcessed?.({ provider: input.provider, providerEventId: input.providerEventId })
  return { duplicate: false }
}
