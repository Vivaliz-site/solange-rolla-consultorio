import type {
  NfseCancelRequest,
  NfseIssueRequest,
  NfseIssueResult,
  NfseProvider,
  NfseStatusResult,
} from '../application/nfse-provider'

export type NationalNfseEnvironment = 'restricted' | 'production'

export type NationalNfsePreparedIssue = {
  dpsId: string
  dpsXmlGZipB64: string
}

export type NationalNfsePreparedCancellation = {
  pedidoRegistroEventoXmlGZipB64: string
}

export type NationalNfsePayloadFactory = {
  prepareIssue(request: NfseIssueRequest): Promise<NationalNfsePreparedIssue>
  prepareCancellation(request: NfseCancelRequest): Promise<NationalNfsePreparedCancellation>
}

export type NationalNfseTransportRequest = {
  operation: 'issue' | 'reconcile-dps' | 'status' | 'cancel'
  method: 'GET' | 'POST'
  url: string
  body?: Record<string, string>
}

export type NationalNfseTransportResponse = {
  status: number
  body: unknown
}

export type NationalNfseTransport = (
  input: NationalNfseTransportRequest,
) => Promise<NationalNfseTransportResponse>

type NationalNfseProviderOptions = {
  liveEnabled: boolean
  environment?: NationalNfseEnvironment
  transport?: NationalNfseTransport
  payloadFactory?: NationalNfsePayloadFactory
}

type JsonRecord = Record<string, unknown>
type DpsLookupPhase = 'preflight' | 'post-attempt'

const OFFICIAL_ENDPOINTS: Record<NationalNfseEnvironment, string> = {
  restricted: 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional',
  production: 'https://sefin.nfse.gov.br/SefinNacional',
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(errorCode)
  return value
}

function assertAccessKey(value: string): void {
  if (!/^\d{50}$/u.test(value)) throw new Error('NFSE_FINAL')
}

function urlFor(endpoint: string, path: string): string {
  return new URL(path.replace(/^\//u, ''), `${endpoint.replace(/\/$/u, '')}/`).toString()
}

export class NationalNfseProvider implements NfseProvider {
  constructor(private readonly options: NationalNfseProviderOptions) {}

  async issue(request: NfseIssueRequest): Promise<NfseIssueResult> {
    const { endpoint, transport, payloadFactory } = this.configured()
    const prepared = await payloadFactory.prepareIssue(request)
    const dpsId = requiredString(prepared.dpsId, 'NFSE_CONFIGURATION_REQUIRED')
    const dpsXmlGZipB64 = requiredString(prepared.dpsXmlGZipB64, 'NFSE_CONFIGURATION_REQUIRED')

    // A retry can happen after a previous POST produced an ambiguous result.
    // Query the immutable DPS first so a retry never blindly emits twice.
    const existing = await this.lookupIssuedByDps(endpoint, transport, dpsId, 'preflight')
    if (existing) return existing

    let response: NationalNfseTransportResponse
    try {
      response = await transport({
        operation: 'issue',
        method: 'POST',
        url: urlFor(endpoint, '/nfse'),
        body: { dpsXmlGZipB64 },
      })
    } catch {
      return this.reconcileAfterIssueAttempt(endpoint, transport, dpsId)
    }

    if (response.status === 201) return this.parseIssueSuccess(response.body)
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new Error('NFSE_FINAL')
    }

    // Any non-final response after POST may still represent a committed issue.
    // Reconcile by DPS instead of replaying the POST.
    return this.reconcileAfterIssueAttempt(endpoint, transport, dpsId)
  }

  async getStatus(externalId: string): Promise<NfseStatusResult> {
    const { endpoint, transport } = this.configured()
    assertAccessKey(externalId)

    let response: NationalNfseTransportResponse
    try {
      response = await transport({
        operation: 'status',
        method: 'GET',
        url: urlFor(endpoint, `/nfse/${encodeURIComponent(externalId)}`),
      })
    } catch {
      throw new Error('NFSE_RETRYABLE')
    }

    if (response.status === 200) {
      return { externalId, status: 'issued' }
    }

    if (response.status === 429 || response.status >= 500) throw new Error('NFSE_RETRYABLE')
    throw new Error('NFSE_FINAL')
  }

  async cancel(request: NfseCancelRequest): Promise<NfseStatusResult> {
    const { endpoint, transport, payloadFactory } = this.configured()
    assertAccessKey(request.externalId)
    const prepared = await payloadFactory.prepareCancellation(request)
    const pedidoRegistroEventoXmlGZipB64 = requiredString(
      prepared.pedidoRegistroEventoXmlGZipB64,
      'NFSE_CONFIGURATION_REQUIRED',
    )

    let response: NationalNfseTransportResponse
    try {
      response = await transport({
        operation: 'cancel',
        method: 'POST',
        url: urlFor(endpoint, `/nfse/${encodeURIComponent(request.externalId)}/eventos`),
        body: { pedidoRegistroEventoXmlGZipB64 },
      })
    } catch {
      throw new Error('NFSE_AMBIGUOUS')
    }

    if (response.status === 201) {
      const payload = this.record(response.body)
      requiredString(payload.eventoXmlGZipB64, 'NFSE_AMBIGUOUS')
      return { externalId: request.externalId, status: 'cancelled' }
    }

    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new Error('NFSE_FINAL')
    }
    throw new Error('NFSE_AMBIGUOUS')
  }

  private configured(): {
    endpoint: string
    transport: NationalNfseTransport
    payloadFactory: NationalNfsePayloadFactory
  } {
    if (!this.options.liveEnabled) throw new Error('NFSE_LIVE_DISABLED')
    if (!this.options.environment || !this.options.transport || !this.options.payloadFactory) {
      throw new Error('NFSE_CONFIGURATION_REQUIRED')
    }

    return {
      endpoint: OFFICIAL_ENDPOINTS[this.options.environment],
      transport: this.options.transport,
      payloadFactory: this.options.payloadFactory,
    }
  }

  private async lookupIssuedByDps(
    endpoint: string,
    transport: NationalNfseTransport,
    dpsId: string,
    phase: DpsLookupPhase,
  ): Promise<NfseIssueResult | null> {
    let response: NationalNfseTransportResponse
    try {
      response = await transport({
        operation: 'reconcile-dps',
        method: 'GET',
        url: urlFor(endpoint, `/dps/${encodeURIComponent(dpsId)}`),
      })
    } catch {
      throw new Error(phase === 'preflight' ? 'NFSE_RETRYABLE' : 'NFSE_AMBIGUOUS')
    }

    if (response.status === 200) {
      const payload = this.record(response.body)
      const chaveAcesso = requiredString(payload.chaveAcesso, 'NFSE_AMBIGUOUS')
      assertAccessKey(chaveAcesso)
      return {
        externalId: chaveAcesso,
        protocol: dpsId,
        status: 'issued',
        synthetic: false,
      }
    }

    if (response.status === 404) {
      if (phase === 'preflight') return null
      throw new Error('NFSE_AMBIGUOUS')
    }

    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new Error('NFSE_FINAL')
    }

    if (phase === 'preflight') throw new Error('NFSE_RETRYABLE')
    throw new Error('NFSE_AMBIGUOUS')
  }

  private async reconcileAfterIssueAttempt(
    endpoint: string,
    transport: NationalNfseTransport,
    dpsId: string,
  ): Promise<NfseIssueResult> {
    const result = await this.lookupIssuedByDps(endpoint, transport, dpsId, 'post-attempt')
    if (!result) throw new Error('NFSE_AMBIGUOUS')
    return result
  }

  private parseIssueSuccess(body: unknown): NfseIssueResult {
    const payload = this.record(body)
    const idDps = requiredString(payload.idDps, 'NFSE_AMBIGUOUS')
    const chaveAcesso = requiredString(payload.chaveAcesso, 'NFSE_AMBIGUOUS')
    requiredString(payload.nfseXmlGZipB64, 'NFSE_AMBIGUOUS')
    assertAccessKey(chaveAcesso)

    return {
      externalId: chaveAcesso,
      protocol: idDps,
      status: 'issued',
      synthetic: false,
    }
  }

  private record(value: unknown): JsonRecord {
    if (!isRecord(value)) throw new Error('NFSE_AMBIGUOUS')
    return value
  }
}
