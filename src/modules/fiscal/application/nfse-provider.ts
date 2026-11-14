import type { FiscalSourceKind } from '../domain/fiscal-treatment'

export type NfseIssueRequest = {
  idempotencyKey: string
  sourceType: FiscalSourceKind
  sourceId: string
  amountCents: number
  issuerDocument: string
  serviceCode: string
  payerDocument: string
  correlationId: string
}

export type NfseIssueResult = {
  externalId: string
  protocol: string
  status: 'issued' | 'processing'
  synthetic: boolean
}

export type NfseStatusResult = {
  externalId: string
  status: 'processing' | 'issued' | 'cancelled' | 'failed'
  protocol?: string
}

export type NfseProviderErrorKind = 'retryable' | 'final' | 'ambiguous'

const FINAL_CONFIGURATION_ERRORS = new Set([
  'NFSE_LIVE_DISABLED',
  'NFSE_CONFIGURATION_REQUIRED',
  'NFSE_SIGNED_XML_REQUIRED',
  'NFSE_DPS_ID_REQUIRED',
  'NFSE_TRANSPORT_URL_INVALID',
  'NFSE_TRANSPORT_HOST_NOT_ALLOWED',
  'NFSE_TRANSPORT_TIMEOUT_INVALID',
])

export function classifyNfseError(error: unknown): NfseProviderErrorKind {
  if (!(error instanceof Error)) return 'retryable'
  if (error.message === 'NFSE_AMBIGUOUS') return 'ambiguous'
  if (error.message === 'NFSE_FINAL' || FINAL_CONFIGURATION_ERRORS.has(error.message)) return 'final'
  return 'retryable'
}

export type NfseCancelRequest = {
  idempotencyKey: string
  externalId: string
  reason: string
  correlationId: string
}

export interface NfseProvider {
  issue(request: NfseIssueRequest): Promise<NfseIssueResult>
  getStatus(externalId: string): Promise<NfseStatusResult>
  cancel(request: NfseCancelRequest): Promise<NfseStatusResult>
}
