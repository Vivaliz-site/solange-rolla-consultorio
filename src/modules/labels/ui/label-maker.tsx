'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import NextImage from 'next/image'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import {
  DEFAULT_GEOMETRY,
  LABEL_SIZE_MM,
  LABELS_PER_SHEET,
  blankPage,
  fitPages,
  hasPrintableLabels,
  labelPosition,
  layoutWithinA4,
  normalizeNames,
  type Geometry,
  type LabelPage,
  type LabelSlot,
} from '../application/layout'
import styles from './label-maker.module.css'

type EventRecord = { id: string; title: string; names: string[]; sheets: LabelPage[] }
type Workspace = { events: EventRecord[]; activeId: string; geometry: Geometry; artData: string; artFit: 'contain' | 'cover'; mode: 'art' | 'names' }
const MM = 72 / 25.4
const sheetSize = [210 * MM, 297 * MM] as const
const subscribeHydration = () => () => {}
const clientIsHydrated = () => true
const serverIsHydrated = () => false
const defaultEvent = (): EventRecord => ({ id: crypto.randomUUID(), title: 'Evento inicial', names: [], sheets: [blankPage()] })
const initialWorkspace = (): Workspace => { const event = defaultEvent(); return { events: [event], activeId: event.id, geometry: { ...DEFAULT_GEOMETRY }, artData: '', artFit: 'contain', mode: 'art' } }

function safeWorkspace(value: unknown): Workspace | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Partial<Workspace>
  if (!Array.isArray(input.events) || !input.events.length || input.events.length > 100) return null
  const events: EventRecord[] = []
  for (const raw of input.events) {
    if (!raw || typeof raw.id !== 'string' || typeof raw.title !== 'string' || !Array.isArray(raw.sheets) || raw.sheets.length > 200) return null
    const sheets = raw.sheets.map((sheet) => {
      if (!Array.isArray(sheet)) return blankPage()
      return Array.from({ length: LABELS_PER_SHEET }, (_, i): LabelSlot => {
        const item = sheet[i]
        return item && typeof item.text === 'string'
          ? { text: item.text.slice(0, 160), used: item.used === true }
          : null
      })
    })
    events.push({ id: raw.id.slice(0, 100), title: raw.title.slice(0, 120), names: Array.isArray(raw.names) ? normalizeNames(raw.names.filter((n): n is string => typeof n === 'string').join('\n')).slice(0, 3000) : [], sheets: sheets.length ? sheets : [blankPage()] })
  }
  const geometry = { ...DEFAULT_GEOMETRY, ...(input.geometry ?? {}) }
  if (!layoutWithinA4(geometry)) Object.assign(geometry, DEFAULT_GEOMETRY)
  return {
    events,
    activeId: events.some((e) => e.id === input.activeId) ? input.activeId! : events[0].id,
    geometry,
    artData: typeof input.artData === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(input.artData) && input.artData.length < 4_000_000 ? input.artData : '',
    artFit: input.artFit === 'cover' ? 'cover' : 'contain',
    mode: input.mode === 'names' ? 'names' : 'art',
  }
}

function normalizeNumber(value: string, min: number, max: number) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min
}
function download(data: Blob, name: string) {
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 20_000)
}
async function circularArtwork(src: string, fit: 'contain' | 'cover'): Promise<string> {
  const image = new Image()
  image.src = src
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 600
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível preparar a imagem.')
  ctx.save()
  ctx.beginPath()
  ctx.arc(300, 300, 300, 0, Math.PI * 2)
  ctx.clip()
  const aspect = fit === 'cover' ? Math.max(600 / image.width, 600 / image.height) : Math.min(600 / image.width, 600 / image.height)
  const w = image.width * aspect, h = image.height * aspect
  ctx.drawImage(image, (600 - w) / 2, (600 - h) / 2, w, h)
  ctx.restore()
  return canvas.toDataURL('image/png')
}
function linesForName(text: string, maxWidth: number, font: { widthOfTextAtSize: (text: string, size: number) => number }, size: number) {
  const words = text.trim().replace(/\s+/g, ' ').split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate
    else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 4)
}

export function LabelMaker({ storageKey }: { storageKey: string }) {
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(storageKey)
        if (raw) return safeWorkspace(JSON.parse(raw)) ?? initialWorkspace()
      } catch { /* Browser storage may be disabled; use an in-memory workspace. */ }
    }
    return initialWorkspace()
  })
  const hydrated = useSyncExternalStore(subscribeHydration, clientIsHydrated, serverIsHydrated)
  const [bulkNames, setBulkNames] = useState('')
  const [eventName, setEventName] = useState('')
  const [copies, setCopies] = useState(1)
  const [sheetIndex, setSheetIndex] = useState(0)
  const [editing, setEditing] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [pdfUrl, setPdfUrl] = useState('')
  const [generating, setGenerating] = useState(false)
  const backupInput = useRef<HTMLInputElement>(null)
  const artworkInput = useRef<HTMLInputElement>(null)
  const active = workspace.events.find((event) => event.id === workspace.activeId) ?? workspace.events[0]
  const sheet = active?.sheets[sheetIndex] ?? blankPage()

  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(storageKey, JSON.stringify(workspace)) }
    catch { /* Not every browser permits localStorage. Export backup manually. */ }
  }, [hydrated, storageKey, workspace])

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }, [pdfUrl])

  function mutateEvent(update: (event: EventRecord) => EventRecord) {
    setWorkspace((old) => ({ ...old, events: old.events.map((event) => event.id === old.activeId ? update(event) : event) }))
    setPdfUrl(''); setError('')
  }

  function startEvent() {
    const title = eventName.trim().slice(0, 120)
    if (!title) { setError('Digite um nome para criar o evento.'); return }
    const entry: EventRecord = { id: crypto.randomUUID(), title, names: [], sheets: [blankPage()] }
    setWorkspace((old) => ({ ...old, events: [...old.events, entry], activeId: entry.id }))
    setSheetIndex(0); setEditing(0); setBulkNames(''); setEventName(''); setStatus('Evento criado. Insira os nomes na lista.'); setError('')
  }

  function insertBulkNames() {
    const names = normalizeNames(bulkNames)
    if (!names.length) { setError('Digite ao menos um nome, um por linha.'); return }
    const expanded = names.flatMap((name) => Array.from({ length: copies }, () => name))
    const fresh = names.filter((name) => !active.names.some((existing) => existing.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR')))
    mutateEvent((event) => ({ ...event, names: [...event.names, ...fresh], sheets: fitPages(event.sheets, expanded) }))
    setBulkNames(''); setStatus(expanded.length + ' etiqueta(s) inserida(s) em ' + Math.ceil((active.sheets.flat().filter(Boolean).length + expanded.length) / 15) + ' folha(s).')
  }

  function editSlot(index: number, value: LabelSlot) {
    mutateEvent((event) => ({ ...event, sheets: event.sheets.map((page, i) => i === sheetIndex ? page.map((slot, j) => j === index ? value : slot) : page) }))
  }
  function clearMontage() {
    if (!window.confirm('Limpar apenas a montagem deste evento? A lista de nomes será preservada.')) return
    mutateEvent((event) => ({ ...event, sheets: [blankPage()] }))
    setSheetIndex(0); setEditing(0); setStatus('Montagem limpa.')
  }
  function exportBackup() {
    download(new Blob([JSON.stringify(workspace)], { type: 'application/json' }), 'solange-etiquetas-backup.json')
    setStatus('Backup exportado. Guarde o arquivo em local privado.')
  }
  async function importBackup(file: File | undefined) {
    if (!file) return
    if (file.size > 5_000_000) { setError('Backup muito grande.'); return }
    try {
      const imported = safeWorkspace(JSON.parse(await file.text()))
      if (!imported) throw Error()
      setWorkspace(imported); setSheetIndex(0); setEditing(0); setStatus('Backup restaurado neste navegador.'); setError('')
    } catch { setError('Arquivo de backup inválido ou incompatível.') }
  }
  async function uploadArtwork(file: File | undefined) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2_000_000) {
      setError('Escolha PNG, JPG ou WebP com até 2 MB.'); return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setWorkspace((old) => ({ ...old, artData: reader.result as string }))
      setStatus('Imagem carregada neste navegador.'); setError('')
    }
    reader.onerror = () => setError('Não foi possível ler a imagem.')
    reader.readAsDataURL(file)
  }
  async function exportPdf(calibration = false) {
    if (generating) return
    if (!layoutWithinA4(workspace.geometry)) { setError('Corrija as medidas da folha A4 antes de gerar o PDF.'); return }
    if (!calibration && !hasPrintableLabels(active.sheets)) { setError('Insira ao menos uma etiqueta antes de gerar o PDF.'); return }
    setGenerating(true); setError(''); setStatus('Gerando PDF A4...')
    try {
      const pdf = await PDFDocument.create()
      const font = await pdf.embedFont(StandardFonts.Helvetica)
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
      const artSource = workspace.mode === 'art' && workspace.artData ? workspace.artData : ''
      let artwork: Awaited<ReturnType<typeof pdf.embedPng>> | null = null
      if (artSource && !calibration) {
        const cropped = await circularArtwork(artSource, workspace.artFit)
        const png = Uint8Array.from(atob(cropped.split(',')[1]), (char) => char.charCodeAt(0))
        artwork = await pdf.embedPng(png)
      }
      const sheets = calibration ? [blankPage()] : active.sheets.filter((page) => page.some((slot) => slot && !slot.used && slot.text.trim()))
      for (const group of sheets) {
        const page = pdf.addPage([...sheetSize])
        for (let index = 0; index < LABELS_PER_SHEET; index++) {
          const pos = labelPosition(index, workspace.geometry)
          const x = pos.x * MM
          const y = sheetSize[1] - (pos.y + LABEL_SIZE_MM) * MM
          const cx = x + LABEL_SIZE_MM * MM / 2
          const cy = y + LABEL_SIZE_MM * MM / 2
          if (calibration) {
            page.drawCircle({ x: cx, y: cy, size: 26 * MM, borderColor: rgb(0.68, 0.48, 0.66), borderWidth: 0.8 })
            page.drawText(String(index + 1), { x: cx - 3, y: cy - 4, font, size: 8, color: rgb(0.5, 0.42, 0.5) })
            continue
          }
          const slot = group[index]
          if (!slot || slot.used || !slot.text.trim()) continue
          if (artwork) page.drawImage(artwork, { x, y, width: LABEL_SIZE_MM * MM, height: LABEL_SIZE_MM * MM })
          else page.drawCircle({ x: cx, y: cy, size: 26 * MM, borderColor: rgb(0.7, 0.55, 0.7), borderWidth: 0.4 })
          let size = 11
          const max = 121
          let lines = linesForName(slot.text, max, bold, size)
          while ((lines.length > 3 || lines.some((line) => bold.widthOfTextAtSize(line, size) > max)) && size > 7) {
            size--; lines = linesForName(slot.text, max, bold, size)
          }
          lines.forEach((line, i) => {
            // Helvetica/WinAnsi covers Portuguese accents, but not emoji/special Unicode.
            const width = bold.widthOfTextAtSize(line, size)
            page.drawText(line, { x: cx - width / 2, y: cy + (lines.length - 1) * size * 0.62 - i * size * 1.24 - size * 0.35, font: bold, size, color: rgb(0.37, 0.17, 0.34) })
          })
        }
      }
      const bytes = new Uint8Array(await pdf.save())
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      setPdfUrl(url)
      setStatus('PDF pronto: ' + sheets.length + ' folha(s). Abra ou baixe o arquivo. Imprima em A4 / 100%.')
    } catch { setError('Não foi possível gerar o PDF. Verifique nomes com caracteres especiais ou a imagem enviada.') }
    finally { setGenerating(false) }
  }

  if (!hydrated) return <p role="status">Carregando etiquetas deste navegador...</p>
  return <section className={styles.root} aria-label="Gerador de etiquetas Link 9027">
    <div className={styles.toolbar}>
      <button type="button" onClick={exportBackup}>Exportar backup</button>
      <button type="button" onClick={() => backupInput.current?.click()}>Importar backup</button>
      <button type="button" onClick={() => void exportPdf(true)} disabled={generating}>PDF do gabarito</button>
      <button className={styles.primary} type="button" onClick={() => void exportPdf()} disabled={generating}>{generating ? 'Gerando...' : 'Gerar PDF A4'}</button>
      {pdfUrl && <>
        <a href={pdfUrl} download="solange-etiquetas-link9027.pdf">Baixar PDF A4</a>
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer">Abrir PDF / imprimir</a>
      </>}
      <input ref={backupInput} type="file" accept="application/json,.json" hidden onChange={(e) => { void importBackup(e.target.files?.[0]); e.currentTarget.value = '' }} />
    </div>
    {status && <p className={styles.status} role="status">{status}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.columns}>
      <div className={styles.panel}>
        <h2>1. Evento e participantes</h2>
        <label>Evento existente
          <select value={workspace.activeId} onChange={(e) => { setWorkspace((old) => ({ ...old, activeId: e.target.value })); setSheetIndex(0); setEditing(0); setPdfUrl('') }}>
            {workspace.events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
          </select>
        </label>
        <label>Novo evento
          <input value={eventName} placeholder="Ex.: Encontro de novembro" onChange={(e) => setEventName(e.target.value)} maxLength={120} />
        </label>
        <button type="button" onClick={startEvent}>Criar novo evento</button>
        <h3>Lista manual de nomes</h3>
        <p>Digite um nome por linha. Após clicar, os nomes serão inseridos diretamente nas etiquetas.</p>
        <label>Nomes (um por linha)
          <textarea rows={7} value={bulkNames} placeholder={'Ana Souza\nJoão Oliveira\nMaria Silva'} onChange={(e) => setBulkNames(e.target.value)} />
        </label>
        <label>Vias por nome
          <input type="number" min={1} max={20} value={copies} onChange={(e) => setCopies(normalizeNumber(e.target.value, 1, 20))} />
        </label>
        <button type="button" className={styles.primary} onClick={insertBulkNames}>Cadastrar e inserir nas etiquetas</button>
        <p>{normalizeNames(bulkNames).length} nome(s) digitado(s). {active.names.length} nome(s) cadastrado(s) neste evento.</p>
        <h3>Montagem e posições</h3>
        <button type="button" onClick={clearMontage}>Limpar montagem</button>
      </div>
      <div className={styles.panel}>
        <h2>2. Folha A4 - Link 9027</h2>
        <div className={styles.sheetnav}>
          <button type="button" disabled={sheetIndex === 0} onClick={() => { setSheetIndex((n) => n - 1); setEditing(0) }}>Anterior</button>
          <span>Folha {sheetIndex + 1} de {active.sheets.length}</span>
          <button type="button" disabled={sheetIndex === active.sheets.length - 1} onClick={() => { setSheetIndex((n) => n + 1); setEditing(0) }}>Próxima</button>
          <button type="button" onClick={() => { mutateEvent((e) => ({ ...e, sheets: [...e.sheets, blankPage()] })); setSheetIndex(active.sheets.length); setEditing(0) }}>+ Folha</button>
        </div>
        <fieldset className={styles.mode}>
          <legend>Visualização</legend>
          <label><input type="radio" checked={workspace.mode === 'art'} onChange={() => setWorkspace((old) => ({ ...old, mode: 'art' }))} /> Arte + nomes</label>
          <label><input type="radio" checked={workspace.mode === 'names'} onChange={() => setWorkspace((old) => ({ ...old, mode: 'names' }))} /> Só nomes</label>
        </fieldset>
        <div className={styles.paper} aria-label="Pré-visualização de 15 etiquetas">
          {Array.from({ length: LABELS_PER_SHEET }, (_, index) => {
            const slot = sheet[index]
            const pos = labelPosition(index, workspace.geometry)
            return <button key={index} type="button" className={editing === index ? styles.selectedLabel : styles.labelCircle}
              style={{ left: (pos.x / 210 * 100) + '%', top: (pos.y / 297 * 100) + '%', width: (52 / 210 * 100) + '%', height: (52 / 297 * 100) + '%', borderRadius: '50%' }}
              onClick={() => setEditing(index)}
              aria-label={'Editar etiqueta ' + (index + 1) + (slot?.text ? ': ' + slot.text : '')}>
              <span className={styles.labelIndex}>{index + 1}</span>
              {workspace.mode === 'art' && workspace.artData && !slot?.used ? <NextImage className={styles.circleArt} src={workspace.artData} alt="" fill unoptimized style={{ objectFit: workspace.artFit }} /> : null}
              <span className={styles.labelText}>{slot?.used ? 'USADA' : slot?.text || ''}</span>
            </button>
          })}
        </div>
        <p className={styles.hint}>A pré-visualização é proporcional à folha A4. Use gabarito de teste para conferir a posição na impressora.</p>
      </div>
      <div className={styles.panel}>
        <h2>3. Editar e calibrar</h2>
        <h3>Etiqueta {editing + 1} da folha {sheetIndex + 1}</h3>
        <label>Nome ou texto
          <textarea rows={3} value={sheet[editing]?.text ?? ''} onChange={(e) => editSlot(editing, { text: e.target.value.slice(0, 160) })} />
        </label>
        <div className={styles.smallActions}>
          <button type="button" onClick={() => editSlot(editing, null)}>Limpar posição</button>
          <button type="button" onClick={() => editSlot(editing, { text: sheet[editing]?.text ?? '', used: true })}>Marcar como usada</button>
        </div>
        <h3>Arte personalizada</h3>
        <button type="button" onClick={() => artworkInput.current?.click()}>Escolher imagem PNG/JPG</button>
        <input hidden type="file" ref={artworkInput} accept="image/png,image/jpeg,image/webp" onChange={(e) => { void uploadArtwork(e.target.files?.[0]); e.currentTarget.value = '' }} />
        <button type="button" onClick={() => setWorkspace((old) => ({ ...old, artData: '' }))}>Remover arte</button>
        <label>Enquadramento
          <select value={workspace.artFit} onChange={(e) => setWorkspace((old) => ({ ...old, artFit: e.target.value === 'cover' ? 'cover' : 'contain' }))}>
            <option value="contain">Conter sem cortar</option>
            <option value="cover">Preencher e recortar</option>
          </select>
        </label>
        <h3>Medidas Link 9027 (mm)</h3>
        <div className={styles.measures}>
          {([['left', 'Margem esquerda'], ['top', 'Margem superior'], ['gapX', 'Espaço horizontal'], ['gapY', 'Espaço vertical'], ['offsetX', 'Ajuste X'], ['offsetY', 'Ajuste Y']] as const).map(([key, label]) => (
            <label key={key}>{label}
              <input type="number" min={key === 'offsetX' || key === 'offsetY' ? -6 : 0} max={key === 'offsetX' || key === 'offsetY' ? 6 : 30} step="0.25" value={workspace.geometry[key]} onChange={(e) => setWorkspace((old) => ({ ...old, geometry: { ...old.geometry, [key]: Number(e.target.value) } }))} />
            </label>
          ))}
        </div>
        {!layoutWithinA4(workspace.geometry) && <p role="alert" className={styles.error}>A geometria ultrapassa a folha A4.</p>}
        <button type="button" onClick={() => setWorkspace((old) => ({ ...old, geometry: { ...DEFAULT_GEOMETRY } }))}>Restaurar pré-calibração</button>
        <p className={styles.hint}>As medidas são iniciais e não oficiais. Imprima o gabarito em papel comum e sobreponha à folha adesiva antes do primeiro uso.</p>
      </div>
    </div>
  </section>
}
