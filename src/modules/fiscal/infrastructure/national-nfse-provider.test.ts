import { describe, expect, it } from 'vitest'
import {
  NationalNfseProvider,
  type NationalNfsePayloadFactory,
  type NationalNfseTransportRequest,
} from './national-nfse-provider'

const accessKey = '1'.repeat(50)

const issueRequest = {
  idempotencyKey: 'appointment-1:1:1',
  sourceType: 'appointment_completed' as const,
  sourceId: 'appointment-1',
  amountCents: 15000,
  issuerDocument: '12345678901',
  serviceCode: '1.01',
  payerDocument: '98765432100',
  correlationId: 'correlation-1',
}

const cancelRequest = {
  idempotencyKey: 'cancel:appointment-1:1',
  externalId: accessKey,
  reason: 'synthetic controlled test',
  correlationId: 'correlation-1',
}

function payloadFactory(): NationalNfsePayloadFactory {
  return {
    prepareIssue: async () => ({
      dpsId: 'DPS-SYNTHETIC-1',
      dpsXmlGZipB64: 'synthetic-signed-dps-gzip-base64',
    }),
    prepareCancellation: async () => ({
      pedidoRegistroEventoXmlGZipB64: 'synthetic-signed-event-gzip-base64',
    }),
  }
}

describe('NationalNfseProvider', () => {
  it('fails closed before payload preparation or network access when live issuance is disabled', async () => {
    let payloadPrepared = false
    let networkCalled = false
    const provider = new NationalNfseProvider({
      liveEnabled: false,
      environment: 'restricted',
      payloadFactory: {
        prepareIssue: async () => {
          payloadPrepared = true
          return { dpsId: 'x', dpsXmlGZipB64: 'x' }
        },
        prepareCancellation: async () => ({ pedidoRegistroEventoXmlGZipB64: 'x' }),
      },
      transport: async () => {
        networkCalled = true
        throw new Error('network must not be called')
      },
    })

    await expect(provider.issue(issueRequest)).rejects.toThrow('NFSE_LIVE_DISABLED')
    expect(payloadPrepared).toBe(false)
    expect(networkCalled).toBe(false)
  })

  it('fails closed when live is enabled without explicit environment, mTLS transport and signed payload factory', async () => {
    const provider = new NationalNfseProvider({ liveEnabled: true })
    await expect(provider.issue(issueRequest)).rejects.toThrow('NFSE_CONFIGURATION_REQUIRED')
  })

  it('checks the DPS before POST and then uses the official restricted /nfse contract', async () => {
    const calls: NationalNfseTransportRequest[] = []
    const provider = new NationalNfseProvider({
      liveEnabled: true,
      environment: 'restricted',
      payloadFactory: payloadFactory(),
      transport: async (input) => {
        calls.push(input)
        if (input.operation === 'reconcile-dps') return { status: 404, body: {} }
        return {
          status: 201,
          body: {
            idDps: 'DPS-SYNTHETIC-1',
            chaveAcesso: accessKey,
            nfseXmlGZipB64: 'synthetic-nfse-gzip-base64',
          },
        }
      },
    })

    await expect(provider.issue(issueRequest)).resolves.toEqual({
      externalId: accessKey,
      protocol: 'DPS-SYNTHETIC-1',
      status: 'issued',
      synthetic: false,
    })
    expect(calls).toEqual([
      {
        operation: 'reconcile-dps',
        method: 'GET',
        url: 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/dps/DPS-SYNTHETIC-1',
      },
      {
        operation: 'issue',
        method: 'POST',
        url: 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/nfse',
        body: { dpsXmlGZipB64: 'synthetic-signed-dps-gzip-base64' },
      },
    ])
  })

  it('returns an already-issued DPS without replaying POST', async () => {
    const calls: NationalNfseTransportRequest[] = []
    const provider = new NationalNfseProvider({
      liveEnabled: true,
      environment: 'restricted',
      payloadFactory: payloadFactory(),
      transport: async (input) => {
        calls.push(input)
        return { status: 200, body: { chaveAcesso: accessKey } }
      },
    })

    await expect(provider.issue(issueRequest)).resolves.toEqual({
      externalId: accessKey,
      protocol: 'DPS-SYNTHETIC-1',
      status: 'issued',
      synthetic: false,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.operation).toBe('reconcile-dps')
  })

  it('reconciles an ambiguous POST by the immutable DPS id instead of replaying it', async () => {
    const calls: NationalNfseTransportRequest[] = []
    let dpsLookups = 0
    const provider = new NationalNfseProvider({
      liveEnabled: true,
      environment: 'restricted',
      payloadFactory: payloadFactory(),
      transport: async (input) => {
        calls.push(input)
        if (input.operation === 'reconcile-dps') {
          dpsLookups += 1
          return dpsLookups === 1
            ? { status: 404, body: {} }
            : { status: 200, body: { chaveAcesso: accessKey } }
        }
        throw new Error('synthetic network interruption')
      },
    })

    await expect(provider.issue(issueRequest)).resolves.toMatchObject({
      externalId: accessKey,
      protocol: 'DPS-SYNTHETIC-1',
      status: 'issued',
    })
    expect(calls.map((call) => [call.operation, call.method])).toEqual([
      ['reconcile-dps', 'GET'],
      ['issue', 'POST'],
      ['reconcile-dps', 'GET'],
    ])
  })

  it('keeps an unresolved POST outcome ambiguous rather than replaying issuance', async () => {
    const calls: NationalNfseTransportRequest[] = []
    const provider = new NationalNfseProvider({
      liveEnabled: true,
      environment: 'restricted',
      payloadFactory: payloadFactory(),
      transport: async (input) => {
        calls.push(input)
        if (input.operation === 'issue') return { status: 500, body: {} }
        return { status: 404, body: {} }
      },
    })

    await expect(provider.issue(issueRequest)).rejects.toThrow('NFSE_AMBIGUOUS')
    expect(calls.map((call) => call.operation)).toEqual([
      'reconcile-dps',
      'issue',
      'reconcile-dps',
    ])
  })

  it('does not POST when the preflight DPS lookup is temporarily unavailable', async () => {
    const calls: NationalNfseTransportRequest[] = []
    const provider = new NationalNfseProvider({
      liveEnabled: true,
      environment: 'restricted',
      payloadFactory: payloadFactory(),
      transport: async (input) => {
        calls.push(input)
        throw new Error('synthetic lookup outage')
      },
    })

    await expect(provider.issue(issueRequest)).rejects.toThrow('NFSE_RETRYABLE')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.operation).toBe('reconcile-dps')
  })

  it('queries the official NFS-e resource by its 50-digit access key', async () => {
    const calls: NationalNfseTransportRequest[] = []
    const provider = new NationalNfseProvider({
      liveEnabled: true,
      environment: 'production',
      payloadFactory: payloadFactory(),
      transport: async (input) => {
        calls.push(input)
        return {
          status: 200,
          body: { nfseXmlGZipB64: 'synthetic-nfse-gzip-base64' },
        }
      },
    })

    await expect(provider.getStatus(accessKey)).resolves.toEqual({
      externalId: accessKey,
      status: 'issued',
    })
    expect(calls[0]).toEqual({
      operation: 'status',
      method: 'GET',
      url: `https://sefin.nfse.gov.br/SefinNacional/nfse/${accessKey}`,
    })
  })

  it('registers cancellation through the official NFS-e event endpoint', async () => {
    const calls: NationalNfseTransportRequest[] = []
    const provider = new NationalNfseProvider({
      liveEnabled: true,
      environment: 'restricted',
      payloadFactory: payloadFactory(),
      transport: async (input) => {
        calls.push(input)
        return { status: 201, body: { eventoXmlGZipB64: 'synthetic-event-result' } }
      },
    })

    await expect(provider.cancel(cancelRequest)).resolves.toEqual({
      externalId: accessKey,
      status: 'cancelled',
    })
    expect(calls[0]).toEqual({
      operation: 'cancel',
      method: 'POST',
      url: `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/nfse/${accessKey}/eventos`,
      body: { pedidoRegistroEventoXmlGZipB64: 'synthetic-signed-event-gzip-base64' },
    })
  })

  it('treats provider validation and certificate rejection as final failures', async () => {
    const provider = new NationalNfseProvider({
      liveEnabled: true,
      environment: 'restricted',
      payloadFactory: payloadFactory(),
      transport: async () => ({ status: 403, body: {} }),
    })

    await expect(provider.issue(issueRequest)).rejects.toThrow('NFSE_FINAL')
  })
})
