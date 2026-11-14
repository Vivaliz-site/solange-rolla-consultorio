import { describe, expect, it } from 'vitest'
import { classifyNfseError } from './nfse-provider'

describe('classifyNfseError', () => {
  it.each([
    'NFSE_LIVE_DISABLED',
    'NFSE_CONFIGURATION_REQUIRED',
    'NFSE_SIGNED_XML_REQUIRED',
    'NFSE_DPS_ID_REQUIRED',
    'NFSE_TRANSPORT_URL_INVALID',
    'NFSE_TRANSPORT_HOST_NOT_ALLOWED',
    'NFSE_TRANSPORT_TIMEOUT_INVALID',
    'NFSE_FINAL',
  ])('treats %s as a terminal non-retryable failure', (code) => {
    expect(classifyNfseError(new Error(code))).toBe('final')
  })

  it('preserves ambiguous outcomes for reconciliation rather than blind retry', () => {
    expect(classifyNfseError(new Error('NFSE_AMBIGUOUS'))).toBe('ambiguous')
  })

  it('keeps explicitly retryable transport errors retryable', () => {
    expect(classifyNfseError(new Error('NFSE_RETRYABLE'))).toBe('retryable')
  })
})
