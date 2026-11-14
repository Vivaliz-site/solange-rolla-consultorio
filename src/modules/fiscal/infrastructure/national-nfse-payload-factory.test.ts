import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { createSignedXmlNationalNfsePayloadFactory } from './national-nfse-payload-factory'

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

describe('signed XML National NFS-e payload factory', () => {
  it('wraps a signed DPS as official GZip/Base64 JSON payload material', async () => {
    const factory = createSignedXmlNationalNfsePayloadFactory({
      prepareSignedDpsXml: async () => ({
        dpsId: 'DPS-SYNTHETIC-1',
        xml: '<DPS Id="DPS-SYNTHETIC-1"><Signature>synthetic</Signature></DPS>',
      }),
      prepareSignedCancellationXml: async () => '<pedRegEvento />',
    })

    const prepared = await factory.prepareIssue(issueRequest)
    expect(prepared.dpsId).toBe('DPS-SYNTHETIC-1')
    expect(
      gunzipSync(Buffer.from(prepared.dpsXmlGZipB64, 'base64')).toString('utf8'),
    ).toContain('<Signature>synthetic</Signature>')
  })

  it('wraps a signed cancellation event as GZip/Base64', async () => {
    const factory = createSignedXmlNationalNfsePayloadFactory({
      prepareSignedDpsXml: async () => ({ dpsId: 'DPS-1', xml: '<DPS />' }),
      prepareSignedCancellationXml: async () => '<pedRegEvento><Signature>synthetic</Signature></pedRegEvento>',
    })

    const prepared = await factory.prepareCancellation({
      idempotencyKey: 'cancel:1',
      externalId: '1'.repeat(50),
      reason: 'synthetic controlled test',
      correlationId: 'correlation-1',
    })

    expect(
      gunzipSync(Buffer.from(prepared.pedidoRegistroEventoXmlGZipB64, 'base64')).toString('utf8'),
    ).toContain('<Signature>synthetic</Signature>')
  })

  it('fails closed when no signed XML is provided', async () => {
    const factory = createSignedXmlNationalNfsePayloadFactory({
      prepareSignedDpsXml: async () => ({ dpsId: 'DPS-1', xml: '' }),
      prepareSignedCancellationXml: async () => '',
    })

    await expect(factory.prepareIssue(issueRequest)).rejects.toThrow('NFSE_SIGNED_XML_REQUIRED')
  })
})
