import 'server-only'
import { request as httpsRequest } from 'node:https'
import type { NationalNfseTransport } from './national-nfse-provider'

export type NodeMtlsNfseTransportOptions = {
  cert: string | Buffer
  key: string | Buffer
  ca?: string | Buffer
  passphrase?: string
  timeoutMs?: number
}

export function createNodeMtlsNfseTransport(
  options: NodeMtlsNfseTransportOptions,
): NationalNfseTransport {
  const timeoutMs = options.timeoutMs ?? 15_000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
    throw new Error('NFSE_TRANSPORT_TIMEOUT_INVALID')
  }

  return async function nationalNfseTransport(input) {
    const url = new URL(input.url)
    if (url.protocol !== 'https:') throw new Error('NFSE_TRANSPORT_URL_INVALID')
    if (!url.hostname.endsWith('.nfse.gov.br') && url.hostname !== 'nfse.gov.br') {
      throw new Error('NFSE_TRANSPORT_HOST_NOT_ALLOWED')
    }

    const requestBody = input.body ? JSON.stringify(input.body) : undefined

    return await new Promise((resolve, reject) => {
      const request = httpsRequest(
        {
          protocol: 'https:',
          hostname: url.hostname,
          port: url.port ? Number(url.port) : 443,
          path: `${url.pathname}${url.search}`,
          method: input.method,
          cert: options.cert,
          key: options.key,
          ca: options.ca,
          passphrase: options.passphrase,
          rejectUnauthorized: true,
          servername: url.hostname,
          headers: {
            accept: 'application/json',
            ...(requestBody
              ? {
                  'content-type': 'application/json',
                  'content-length': Buffer.byteLength(requestBody).toString(),
                }
              : {}),
          },
        },
        (response) => {
          const chunks: Buffer[] = []
          response.on('data', (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          })
          response.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8')
            let body: unknown = null
            if (raw.trim() !== '') {
              try {
                body = JSON.parse(raw) as unknown
              } catch {
                body = null
              }
            }
            resolve({ status: response.statusCode ?? 0, body })
          })
        },
      )

      request.setTimeout(timeoutMs, () => {
        request.destroy(new Error('NFSE_TRANSPORT_TIMEOUT'))
      })
      request.on('error', reject)
      if (requestBody) request.write(requestBody)
      request.end()
    })
  }
}
