import type { QueuePort } from '../platform/queue/types'

type DocumentQueuePayload = { jobId: string }
type ProcessResult = 'completed' | 'retry' | 'failed_final'
export type WorkerLogger = (event: string, metadata: Record<string, unknown>) => void

type DrainOptions = {
  queue: QueuePort<DocumentQueuePayload>
  process: (jobId: string) => Promise<ProcessResult>
  batchSize?: number
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const finalCodes = new Set([
  'DOCUMENT_JOB_NOT_FOUND',
  'DOCUMENT_RENDER_FAILED',
  'DOCUMENT_SOURCE_INTEGRITY_ERROR',
  'DOCUMENT_STORAGE_CONFLICT',
])

function validMessage(message: unknown): message is { kind: 'signed-form.pdf'; payload: DocumentQueuePayload } {
  if (!message || typeof message !== 'object') return false
  const candidate = message as { kind?: unknown; idempotencyKey?: unknown; payload?: unknown }
  if (candidate.kind !== 'signed-form.pdf' || typeof candidate.idempotencyKey !== 'string') return false
  if (!candidate.payload || typeof candidate.payload !== 'object' || Array.isArray(candidate.payload)) return false
  const payload = candidate.payload as Record<string, unknown>
  return Object.keys(payload).length === 1 && typeof payload.jobId === 'string' && uuidPattern.test(payload.jobId)
}
export async function drainDocumentQueueOnce({ queue, process, batchSize = 5 }: DrainOptions): Promise<number> {
  const jobs = await queue.read({ visibilityTimeoutSeconds: 120, batchSize: Math.max(1, Math.min(20, batchSize)) })
  let completed = 0
  for (const job of jobs) {
    if (!validMessage(job.message)) {
      if (!await queue.archive(job.id)) throw new Error('DOCUMENT_ARCHIVE_FAILED')
      completed += 1
      continue
    }
    const result = await process(job.message.payload.jobId)
    if (result === 'retry') {
      if (!await queue.requeue(job.id, 60)) throw new Error('DOCUMENT_REQUEUE_FAILED')
      continue
    }
    if (!await queue.archive(job.id)) throw new Error('DOCUMENT_ARCHIVE_FAILED')
    completed += 1
  }
  return completed
}

function safeErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return 'DOCUMENT_WORKER_TRANSIENT'
  return /^[A-Z][A-Z0-9_]{2,99}$/u.test(error.message) ? error.message : 'DOCUMENT_WORKER_TRANSIENT'
}

export async function processDocumentJob(jobId: string, dependencies: {
  render: (jobId: string) => Promise<unknown>
  logger?: WorkerLogger
}): Promise<ProcessResult> {
  try {
    await dependencies.render(jobId)
    dependencies.logger?.('document_job_completed', { jobId })
    return 'completed'
  } catch (error) {
    const code = safeErrorCode(error)
    const result: ProcessResult = finalCodes.has(code) ? 'failed_final' : 'retry'
    dependencies.logger?.('document_job_failed', { jobId, code, result })
    return result
  }
}
function defaultWait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      // Polling pode durar indefinidamente: remover o listener quando o tempo acaba.
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function runDocumentWorker(options: {
  signal: AbortSignal
  dispatch?: () => Promise<{ claimed: number; dispatched: number } | void>
  drain: () => Promise<number>
  pollMs?: number
  wait?: (ms: number, signal: AbortSignal) => Promise<void>
  logger?: WorkerLogger
  heartbeat?: () => Promise<void>
}): Promise<void> {
  const pollMs = Math.max(250, options.pollMs ?? 2000)
  const wait = options.wait ?? defaultWait
  while (!options.signal.aborted) {
    let dispatchOk = true
    try {
      const result = await options.dispatch?.()
      // Released queue-send failures return counts instead of rejecting.
      if (result && result.dispatched !== result.claimed) {
        throw new Error('DOCUMENT_DISPATCH_INCOMPLETE')
      }
    } catch (error) {
      dispatchOk = false
      options.logger?.('document_worker_dispatch_failed', { code: safeErrorCode(error) })
    }
    try {
      const completed = await options.drain()
      if (dispatchOk) await options.heartbeat?.()
      options.logger?.('document_worker_poll_ok', { completed, dispatchOk })
    } catch (error) {
      options.logger?.('document_worker_poll_failed', { code: safeErrorCode(error) })
    }
    if (!options.signal.aborted) await wait(pollMs, options.signal)
  }
}
