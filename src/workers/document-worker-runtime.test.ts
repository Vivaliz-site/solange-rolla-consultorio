import { describe, expect, it, vi } from 'vitest'
import { drainDocumentQueueOnce, processDocumentJob, runDocumentWorker } from './document-worker-runtime'

const queueJob = {
  id: 'queue-1', readCount: 1, enqueuedAt: '2026-08-30T00:00:00.000Z', visibleAt: '2026-08-30T00:00:00.000Z',
  message: {
    kind: 'signed-form.pdf', idempotencyKey: 'signed-form:v1', correlationId: 'corr-1',
    createdAt: '2026-08-30T00:00:00.000Z', payload: { jobId: '11111111-1111-4111-8111-111111111111' },
  },
}

describe('document worker runtime', () => {
  it('archives a successfully rendered queue job', async () => {
    const queue = {
      read: vi.fn(async () => [queueJob]), archive: vi.fn(async () => true),
      requeue: vi.fn(async () => true), send: vi.fn(),
    }
    const process = vi.fn(async () => 'completed' as const)
    await expect(drainDocumentQueueOnce({ queue, process })).resolves.toBe(1)
    expect(queue.archive).toHaveBeenCalledWith('queue-1')
    expect(queue.requeue).not.toHaveBeenCalled()
  })

  it('requeues a retryable job for sixty seconds', async () => {
    const queue = {
      read: vi.fn(async () => [queueJob]), archive: vi.fn(async () => true),
      requeue: vi.fn(async () => true), send: vi.fn(),
    }
    await drainDocumentQueueOnce({ queue, process: vi.fn(async () => 'retry' as const) })
    expect(queue.requeue).toHaveBeenCalledWith('queue-1', 60)
    expect(queue.archive).not.toHaveBeenCalled()
  })

  it('archives malformed messages without rendering', async () => {
    const queue = {
      read: vi.fn(async () => [{ ...queueJob, message: { ...queueJob.message, payload: { jobId: 'bad', answers: 'secret' } } }]),
      archive: vi.fn(async () => true), requeue: vi.fn(async () => true), send: vi.fn(),
    }
    const process = vi.fn()
    await drainDocumentQueueOnce({ queue: queue as never, process })
    expect(process).not.toHaveBeenCalled()
    expect(queue.archive).toHaveBeenCalledWith('queue-1')
  })

  it('maps known final errors to failed_final and transient errors to retry without leaking messages', async () => {
    const logs: unknown[] = []
    const logger = (event: string, metadata: Record<string, unknown>) => logs.push({ event, metadata })
    await expect(processDocumentJob('job-1', {
      render: vi.fn(async () => { throw new Error('DOCUMENT_STORAGE_CONFLICT') }), logger,
    })).resolves.toBe('failed_final')
    await expect(processDocumentJob('job-2', {
      render: vi.fn(async () => { throw new Error('network SIGNED_DOC_SENSITIVE_SENTINEL') }), logger,
    })).resolves.toBe('retry')
    expect(JSON.stringify(logs)).not.toContain('SIGNED_DOC_SENSITIVE_SENTINEL')
  })

  it('stops the polling loop cleanly when aborted', async () => {
    const controller = new AbortController()
    const drain = vi.fn(async () => { controller.abort(); return 0 })
    const wait = vi.fn(async () => undefined)
    await runDocumentWorker({ signal: controller.signal, drain, wait, pollMs: 250 })
    expect(drain).toHaveBeenCalledTimes(1)
    expect(wait).not.toHaveBeenCalled()
  })

  it('continues draining queued work when dispatch fails without refreshing a healthy heartbeat', async () => {
    const controller = new AbortController()
    const dispatch = vi.fn(async () => { throw new Error('DOCUMENT_DISPATCH_UNAVAILABLE') })
    const drain = vi.fn(async () => { controller.abort(); return 1 })
    const wait = vi.fn(async () => undefined)
    const logger = vi.fn()
    const heartbeat = vi.fn(async () => undefined)

    await runDocumentWorker({ signal: controller.signal, dispatch, drain, wait, logger, heartbeat, pollMs: 250 })

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(drain).toHaveBeenCalledTimes(1)
    expect(heartbeat).not.toHaveBeenCalled()
    expect(logger).toHaveBeenCalledWith('document_worker_dispatch_failed', { code: 'DOCUMENT_DISPATCH_UNAVAILABLE' })
    expect(logger).toHaveBeenCalledWith('document_worker_poll_ok', { completed: 1, dispatchOk: false })
  })

  it('refreshes the heartbeat again after the dispatcher recovers', async () => {
    const controller = new AbortController()
    let dispatchAttempt = 0
    let drainAttempt = 0
    const dispatch = vi.fn(async () => {
      dispatchAttempt += 1
      if (dispatchAttempt === 1) throw new Error('DOCUMENT_DISPATCH_UNAVAILABLE')
    })
    const drain = vi.fn(async () => {
      drainAttempt += 1
      if (drainAttempt === 2) controller.abort()
      return 0
    })
    const wait = vi.fn(async () => undefined)
    const heartbeat = vi.fn(async () => undefined)

    await runDocumentWorker({ signal: controller.signal, dispatch, drain, wait, heartbeat, pollMs: 250 })

    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(drain).toHaveBeenCalledTimes(2)
    expect(heartbeat).toHaveBeenCalledTimes(1)
  })

  it('dispatches pending outbox jobs before draining the queue', async () => {
    const controller = new AbortController()
    const order: string[] = []
    const dispatch = vi.fn(async () => { order.push('dispatch') })
    const drain = vi.fn(async () => { order.push('drain'); controller.abort(); return 0 })
    const wait = vi.fn(async () => undefined)

    await runDocumentWorker({ signal: controller.signal, dispatch, drain, wait, pollMs: 250 })

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(drain).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['dispatch', 'drain'])
  })

  it('cleans abort listeners between successful worker polls', async () => {
    const controller = new AbortController()
    const addListener = vi.spyOn(controller.signal, 'addEventListener')
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener')
    let cycles = 0
    const drain = vi.fn(async () => {
      cycles += 1
      if (cycles === 3) controller.abort()
      return 0
    })

    await runDocumentWorker({ signal: controller.signal, drain, pollMs: 250 })

    expect(drain).toHaveBeenCalledTimes(3)
    expect(addListener.mock.calls.filter(([event]) => event === 'abort')).toHaveLength(2)
    expect(removeListener.mock.calls.filter(([event]) => event === 'abort')).toHaveLength(2)
  }, 3000)

})
