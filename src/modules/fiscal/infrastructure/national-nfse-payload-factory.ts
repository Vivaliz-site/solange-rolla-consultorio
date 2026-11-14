import { gzipSync } from 'node:zlib'
import type { NfseCancelRequest, NfseIssueRequest } from '../application/nfse-provider'
import type {
  NationalNfsePayloadFactory,
  NationalNfsePreparedCancellation,
  NationalNfsePreparedIssue,
} from './national-nfse-provider'

export type SignedNationalNfseXmlFactory = {
  prepareSignedDpsXml(request: NfseIssueRequest): Promise<{ dpsId: string; xml: string }>
  prepareSignedCancellationXml(request: NfseCancelRequest): Promise<string>
}

function gzipBase64(xml: string): string {
  if (typeof xml !== 'string' || xml.trim() === '') {
    throw new Error('NFSE_SIGNED_XML_REQUIRED')
  }
  return gzipSync(Buffer.from(xml, 'utf8')).toString('base64')
}

export function createSignedXmlNationalNfsePayloadFactory(
  source: SignedNationalNfseXmlFactory,
): NationalNfsePayloadFactory {
  return {
    async prepareIssue(request: NfseIssueRequest): Promise<NationalNfsePreparedIssue> {
      const prepared = await source.prepareSignedDpsXml(request)
      if (typeof prepared.dpsId !== 'string' || prepared.dpsId.trim() === '') {
        throw new Error('NFSE_DPS_ID_REQUIRED')
      }
      return {
        dpsId: prepared.dpsId,
        dpsXmlGZipB64: gzipBase64(prepared.xml),
      }
    },

    async prepareCancellation(request: NfseCancelRequest): Promise<NationalNfsePreparedCancellation> {
      return {
        pedidoRegistroEventoXmlGZipB64: gzipBase64(
          await source.prepareSignedCancellationXml(request),
        ),
      }
    },
  }
}
