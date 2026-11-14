import { writeFile } from 'node:fs/promises'
import { createQueue } from '../src/platform/queue/queue'
import { createServerSupabaseQueueBackend } from '../src/platform/queue/supabase-queue'
import { serverEnv } from '../src/platform/env/server'
import { dispatchDocumentJobs } from '../src/modules/signatures/application/dispatch-document-jobs'
import { renderSignedDocument } from '../src/modules/signatures/application/render-signed-document'
import { renderSignedFormPdf } from '../src/modules/signatures/infrastructure/pdf-renderer'
import { createSupabaseDocumentDispatchRepository } from '../src/modules/signatures/infrastructure/supabase-document-dispatch-repository'
import { createSupabaseSignedDocumentRepository } from '../src/modules/signatures/infrastructure/supabase-signed-document-repository'
import { createSupabaseSignedDocumentStorage } from '../src/modules/signatures/infrastructure/supabase-signed-document-storage'
import { drainDocumentQueueOnce, processDocumentJob, runDocumentWorker } from '../src/workers/document-worker-runtime'

function positiveInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function log(event: string, metadata: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...metadata }))
}

async function main() {
  serverEnv()
  const controller = new AbortController()
  process.on('SIGTERM', () => controller.abort())
  process.on('SIGINT', () => controller.abort())

  const repository = createSupabaseSignedDocumentRepository()
  const dispatchRepository = createSupabaseDocumentDispatchRepository()
  const storage = createSupabaseSignedDocumentStorage()
  const queue = createQueue<{ jobId: string }>({
    name: 'documents',
    backend: createServerSupabaseQueueBackend(),
  })
  const batchSize = positiveInt(process.env.DOCUMENT_WORKER_BATCH_SIZE, 5, 1, 20)
  const pollMs = positiveInt(process.env.DOCUMENT_WORKER_POLL_MS, 2000, 250, 60000)
  const heartbeatPath = process.env.DOCUMENT_WORKER_HEALTH_FILE ?? '/tmp/solange-document-worker.heartbeat'

  const render = (jobId: string) => renderSignedDocument(jobId, {
    repository,
    storage,
    renderer: renderSignedFormPdf,
  })
  const processJob = (jobId: string) => processDocumentJob(jobId, { render, logger: log })
  const drain = () => drainDocumentQueueOnce({ queue, process: processJob, batchSize })
  const heartbeat = () => writeFile(heartbeatPath, new Date().toISOString(), { encoding: 'utf8', mode: 0o600 })

  log('document_worker_started', { batchSize, pollMs })
  await runDocumentWorker({
    signal: controller.signal,
    dispatch: () => dispatchDocumentJobs({ repository: dispatchRepository, queue, limit: batchSize }),
    drain,
    pollMs,
    logger: log,
    heartbeat,
  })
  log('document_worker_stopped')
}

main().catch(() => {
  console.error(JSON.stringify({ at: new Date().toISOString(), event: 'document_worker_fatal' }))
  process.exitCode = 1
})
