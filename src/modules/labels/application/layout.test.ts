import { describe, expect, it } from 'vitest'
import { DEFAULT_GEOMETRY, blankPage, fitPages, hasPrintableLabels, labelPosition, layoutWithinA4, normalizeNames } from './layout'

describe('etiquetas Link 9027', () => {
  it('remove nomes vazios e repetidos ignorando maiúsculas', () => {
    expect(normalizeNames(' Ana Souza\n \nANA  Souza\r\nJoão Oliveira \rMaria Silva')).toEqual(['Ana Souza', 'João Oliveira', 'Maria Silva'])
  })

  it.each([1, 3, 15, 16, 30])('monta %i nomes sem perder posições', (count) => {
    const names = Array.from({ length: count }, (_, index) => 'Pessoa de teste ' + (index + 1))
    const sheets = fitPages([blankPage()], names)
    expect(sheets).toHaveLength(Math.ceil(count / 15))
    expect(sheets.flat().filter((slot) => slot && !slot.used).map((slot) => slot?.text)).toEqual(names)
    expect(hasPrintableLabels(sheets)).toBe(true)
  })

  it('respeita posições já utilizadas', () => {
    const existing = blankPage()
    existing[0] = { text: 'Usada', used: true }
    existing[2] = { text: 'Existente' }
    const pages = fitPages([existing], ['Nome novo'])
    expect(pages[0][0]?.used).toBe(true)
    expect(pages[0][1]?.text).toBe('Nome novo')
    expect(pages[0][2]?.text).toBe('Existente')
  })

  it('calibração padrão é geométrica e rejeita extrapolação', () => {
    expect(layoutWithinA4({ ...DEFAULT_GEOMETRY })).toBe(true)
    expect(labelPosition(14, { ...DEFAULT_GEOMETRY })).toEqual({ x: 134, y: 232.5 })
    expect(layoutWithinA4({ ...DEFAULT_GEOMETRY, gapY: 10 })).toBe(false)
    expect(layoutWithinA4({ ...DEFAULT_GEOMETRY, left: -10 })).toBe(false)
  })
})
