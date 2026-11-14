import { describe, expect, it } from 'vitest'
import { dispatchDocumentJobs, type DocumentDispatchRepository } from '../modules/signatures/application/dispatch-document-jobs'
import type { QueueJob, QueuePort } from '../platform/queue/types'
import { drainDocumentQueueOnce, runDocumentWorker } from './document-worker-runtime'

const firstId = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'
const existingId = '33333333-3333-4333-8333-333333333333'
const timestamp = '2026-10-06T00:00:00.000Z'

function createPipeline(failingIds: string[], pendingIds = [firstId, secondId]) {
  const pending = new Map(pendingIds.map((id) => [id, { id, idempotencyKey: `signed-form:${id}` }]))
  const failures = new Set(failingIds)
  const released: string[] = []
  const rendered: string[] = []
  const messages: QueueJob<{ jobId: string }>[] = [{
    id: 'existing-message', readCount: 1, enqueuedAt: timestamp, visibleAt: timestamp,
    message: { kind: 'signed-form.pdf', idempotencyKey: 'existing', correlationId: existingId,
      createdAt: timestamp, payload: { jobId: existingId } },
  }]
  let sequence = 0
  const repository: DocumentDispatchRepository = {
    async claimPending(limit) { return [...pending.values()].slice(0, limit) },
    async markDispatched(id) { pending.delete(id) },
    async releaseDispatch(id, code) { released.push(`${id}:${code}`) },
  }
  const queue: QueuePort<{ jobId: string }> = {
    async send(message) {
      if (failures.has(message.payload.jobId)) throw new Error('QUEUE_PRIVATE_SENTINEL')
      const id = `message-${++sequence}`
      messages.push({ id, readCount: 1, enqueuedAt: timestamp, visibleAt: timestamp,
        message: { ...message, createdAt: timestamp } })
      return id
    },
    async read() { return [...messages] },
    async archive(id) {
      const index = messages.findIndex((message) => message.id === id)
      if (index < 0) return false
      messages.splice(index, 1)
      return true
    },
    async requeue() { return true },
  }
  return {
    pending, failures, released, rendered,
    dispatch: () => dispatchDocumentJobs({ repository, queue }),
    drain: () => drainDocumentQueueOnce({ queue, process: async (id) => {
      rendered.push(id)
      return 'completed'
    } }),
  }
}

describe('document pipeline dispatch health', () => {
  it.each([{ failingIds: [firstId] }, { failingIds: [firstId, secondId] }])('withholds healthy heartbeat after queue send failures $failingIds while draining existing work', async ({ failingIds }) => {
    const pipeline = createPipeline(failingIds)
    const controller = new AbortController()
    const events: { event: string; metadata: Record<string, unknown> }[] = []
    let heartbeats = 0
    await runDocumentWorker({
      signal: controller.signal, dispatch: pipeline.dispatch,
      drain: async () => { const completed = await pipeline.drain(); controller.abort(); return completed },
      heartbeat: async () => { heartbeats += 1 },
      logger: (event, metadata) => { events.push({ event, metadata }) },
    })
    expect(pipeline.rendered).toContain(existingId)
    expect(pipeline.rendered).toHaveLength(3 - failingIds.length)
    expect([...pipeline.pending.keys()]).toEqual(failingIds)
    expect(pipeline.released).toEqual(failingIds.map((id) => `${id}:QUEUE_SEND_FAILED`))
    expect(heartbeats).toBe(0)
    expect(events).toContainEqual({ event: 'document_worker_dispatch_failed', metadata: { code: 'DOCUMENT_DISPATCH_INCOMPLETE' } })
    expect(JSON.stringify(events)).not.toContain('QUEUE_PRIVATE_SENTINEL')
  })

  it('returns to healthy only when the real dispatcher recovers and pending work drains', async () => {
    const pipeline = createPipeline([firstId])
    const controller = new AbortController()
    const heartbeatRounds: number[] = []
    let round = 0
    await runDocumentWorker({
      signal: controller.signal, dispatch: pipeline.dispatch,
      drain: async () => {
        const completed = await pipeline.drain()
        round += 1
        pipeline.failures.clear()
        if (round === 2) controller.abort()
        return completed
      },
      wait: async () => undefined,
      heartbeat: async () => { heartbeatRounds.push(round) },
    })
    expect(pipeline.pending.size).toBe(0)
    expect(pipeline.rendered).toEqual([existingId, secondId, firstId])
    expect(heartbeatRounds).toEqual([2])
  })

  it.each([{ pendingIds: [] }, { pendingIds: [firstId, secondId] }])('keeps a fully dispatched or idle pipeline healthy $pendingIds', async ({ pendingIds }) => {
    const pipeline = createPipeline([], pendingIds)
    const controller = new AbortController()
    let heartbeats = 0
    await runDocumentWorker({
      signal: controller.signal, dispatch: pipeline.dispatch,
      drain: async () => { const completed = await pipeline.drain(); controller.abort(); return completed },
      heartbeat: async () => { heartbeats += 1 },
    })
    expect(pipeline.pending.size).toBe(0)
    expect(heartbeats).toBe(1)
    expect(pipeline.rendered).toHaveLength(pendingIds.length + 1)
  })
})
