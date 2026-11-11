export const LABELS_PER_SHEET = 15
export const LABEL_SIZE_MM = 52
export const SHEET_WIDTH_MM = 210
export const SHEET_HEIGHT_MM = 297
export const DEFAULT_GEOMETRY = Object.freeze({
  left: 24, top: 12.5, gapX: 3, gapY: 3, offsetX: 0, offsetY: 0,
})

export type Geometry = { left: number; top: number; gapX: number; gapY: number; offsetX: number; offsetY: number }
export type LabelSlot = { text: string; used?: boolean } | null
export type LabelPage = LabelSlot[]

export function normalizeNames(source: string): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const line of source.split(/\r\n|\r|\n/)) {
    const name = line.replace(/\s+/g, ' ').trim().slice(0, 160)
    const normalized = name.toLocaleLowerCase('pt-BR')
    if (name && !seen.has(normalized)) { seen.add(normalized); names.push(name) }
  }
  return names
}

export function blankPage(): LabelPage {
  return Array.from({ length: LABELS_PER_SHEET }, () => null)
}

export function fitPages(pages: LabelPage[], extra: string[]): LabelPage[] {
  const result = pages.length
    ? pages.map((page) => Array.from({ length: LABELS_PER_SHEET }, (_, index) => page[index] ?? null))
    : [blankPage()]
  for (const text of extra) {
    let inserted = false
    for (const page of result) {
      const index = page.findIndex((slot) => slot === null)
      if (index >= 0) { page[index] = { text }; inserted = true; break }
    }
    if (!inserted) { const page = blankPage(); page[0] = { text }; result.push(page) }
  }
  return result
}

export function layoutWithinA4(geometry: Geometry): boolean {
  const dimensions = [geometry.left, geometry.top, geometry.gapX, geometry.gapY, geometry.offsetX, geometry.offsetY]
  if (dimensions.some((value) => !Number.isFinite(value))) return false
  if (geometry.gapX < 0 || geometry.gapY < 0) return false
  const left = geometry.left + geometry.offsetX
  const top = geometry.top + geometry.offsetY
  const right = left + 3 * LABEL_SIZE_MM + 2 * geometry.gapX
  const bottom = top + 5 * LABEL_SIZE_MM + 4 * geometry.gapY
  return left >= 0 && top >= 0 && right <= SHEET_WIDTH_MM && bottom <= SHEET_HEIGHT_MM
}

export function labelPosition(index: number, geometry: Geometry) {
  const column = index % 3
  const row = Math.floor(index / 3)
  return {
    x: geometry.left + geometry.offsetX + column * (LABEL_SIZE_MM + geometry.gapX),
    y: geometry.top + geometry.offsetY + row * (LABEL_SIZE_MM + geometry.gapY),
  }
}

export function hasPrintableLabels(pages: LabelPage[]) {
  return pages.some((page) => page.some((slot) => slot && !slot.used && slot.text.trim()))
}
