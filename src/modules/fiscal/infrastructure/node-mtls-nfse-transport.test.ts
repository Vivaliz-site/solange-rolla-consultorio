import { describe, expect, it } from 'vitest'
import { createNodeMtlsNfseTransport } from './node-mtls-nfse-transport'

const transportOptions = {
  cert: 'synthetic certificate',
  key: 'synthetic private key',
}

describe('Node mTLS National NFS-e transport', () => {
  it('rejects non-HTTPS endpoints before opening a socket', async () => {
    const transport = createNodeMtlsNfseTransport(transportOptions)
    await expect(transport({
      operation: 'status',
      method: 'GET',
      url: 'http://sefin.nfse.gov.br/SefinNacional/nfse/' + '1'.repeat(50),
    })).rejects.toThrow('NFSE_TRANSPORT_URL_INVALID')
  })

  it('rejects hosts outside the official nfse.gov.br boundary before opening a socket', async () => {
    const transport = createNodeMtlsNfseTransport(transportOptions)
    await expect(transport({
      operation: 'status',
      method: 'GET',
      url: 'https://example.test/nfse/' + '1'.repeat(50),
    })).rejects.toThrow('NFSE_TRANSPORT_HOST_NOT_ALLOWED')
  })

  it('validates the timeout policy at construction time', () => {
    expect(() => createNodeMtlsNfseTransport({
      ...transportOptions,
      timeoutMs: 500,
    })).toThrow('NFSE_TRANSPORT_TIMEOUT_INVALID')
  })
})
