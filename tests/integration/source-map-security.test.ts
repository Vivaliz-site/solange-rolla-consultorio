import { describe, expect, it } from 'vitest'
import { SourceMapConsumer } from 'source-map-js'

const flatMap = {
  version: '3',
  file: 'synthetic-bundle.js',
  sources: ['synthetic-input.js'],
  sourcesContent: ['const synthetic = 1'],
  names: [],
  mappings: 'AAAA',
}

function indexedMap(line: number, map = flatMap) {
  return { ...flatMap, sources: [], mappings: '', sections: [{ offset: { line, column: 0 }, map }] }
}

describe('source-map-js CVE-2026-93749 regression', () => {
  // Construction is small even on the vulnerable version. Never serialize the
  // malicious mappings: that is the expensive path this regression prevents.
  it('rejects an indexed section beyond the upstream line bound', () => {
    expect(() => new SourceMapConsumer(indexedMap(10_000_001))).toThrow(/must not exceed/)
  })

  it('rejects nested sections whose cumulative line offset exceeds the bound', () => {
    const nested = indexedMap(6_000_000, indexedMap(6_000_000))
    expect(() => new SourceMapConsumer(nested)).toThrow(/including offsets of nested sections/)
  })

  it('still consumes ordinary source mappings', () => {
    const consumer = new SourceMapConsumer(flatMap)
    expect(consumer.originalPositionFor({ line: 1, column: 0 })).toEqual({
      source: 'synthetic-input.js', line: 1, column: 0, name: null,
    })
  })
})
