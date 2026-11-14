import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const scriptPath = fileURLToPath(new URL('../../scripts/document-worker.ts', import.meta.url))

describe('document worker dispatch wiring', () => {
  it('publishes pending document outbox jobs before polling the queue', () => {
    const source = readFileSync(scriptPath, 'utf8')

    expect(source).toContain('createSupabaseDocumentDispatchRepository')
    expect(source).toContain('dispatchDocumentJobs')
    expect(source).toMatch(
      /dispatch:\s*\(\)\s*=>\s*dispatchDocumentJobs\(\{ repository: dispatchRepository, queue, limit: batchSize \}\)/u,
    )
  })
})
