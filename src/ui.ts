import { strToU8, zipSync } from 'fflate'
import type { ExportPayload, KitSummary, SandboxToUi, ScanResult, UiToSandbox } from './messages'
import type { Diagnostic } from './uiir'

function send(message: UiToSandbox): void {
  parent.postMessage({ pluginMessage: message }, '*')
}

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (found === null) throw new Error(`elemento #${id} nao existe no ui.html`)
  return found as T
}

const screenNameEl = el('screen-name')
const canvasSizeEl = el('canvas-size')
const reportEl = el('report')
const statusEl = el('status')
const exportButton = el<HTMLButtonElement>('export')

const kitPanel = el('panel-kit')
const exportPanel = el('panel-export')
const kitTab = el<HTMLButtonElement>('tab-kit')
const exportTab = el<HTMLButtonElement>('tab-export')
const kitButton = el<HTMLButtonElement>('create-kit')
const kitStatusEl = el('kit-status')
const kitResultEl = el('kit-result')

const stats = {
  nodes: el('stat-nodes'),
  components: el('stat-components'),
  binds: el('stat-binds'),
  assets: el('stat-assets'),
}

let current: ScanResult | null = null

exportButton.addEventListener('click', () => {
  exportButton.disabled = true
  setStatus('Montando o pacote...', null)
  send({ type: 'export' })
})

kitButton.addEventListener('click', () => {
  kitButton.disabled = true
  setKitStatus('Criando componentes...', null)
  kitResultEl.replaceChildren()
  send({ type: 'create-kit' })
})

exportTab.addEventListener('click', () => selectTab('export'))
kitTab.addEventListener('click', () => selectTab('kit'))

function selectTab(mode: 'export' | 'kit'): void {
  const exporting = mode === 'export'

  exportPanel.hidden = !exporting
  kitPanel.hidden = exporting
  exportTab.setAttribute('aria-selected', String(exporting))
  kitTab.setAttribute('aria-selected', String(!exporting))
}

window.onmessage = (event: MessageEvent): void => {
  const message = (event.data as { pluginMessage?: SandboxToUi } | null)?.pluginMessage
  if (message === undefined) return

  switch (message.type) {
    case 'scanned':
      current = message.result
      render(message.result)
      break
    case 'busy':
      exportButton.disabled = true
      setStatus(message.label, null)
      break
    case 'export-ready':
      void deliver(message.payload)
      break
    case 'kit-created':
      renderKitResult(message.summary)
      break
    case 'failed':
      // Um erro pode vir de qualquer um dos dois fluxos; mostrar nos dois evita a mensagem
      // aparecer numa aba que o usuário não está olhando.
      setStatus(message.message, 'error')
      setKitStatus(message.message, 'error')
      exportButton.disabled = true
      kitButton.disabled = false
      break
  }
}

function renderKitResult(summary: KitSummary): void {
  kitButton.disabled = false

  const parts: string[] = []
  if (summary.created.length > 0) parts.push(`${summary.created.length} criado(s)`)
  if (summary.skipped.length > 0) parts.push(`${summary.skipped.length} já existia(m)`)
  if (summary.stylesCreated > 0) parts.push(`${summary.stylesCreated} estilo(s)`)

  setKitStatus(
    parts.length > 0 ? `${parts.join(', ')} na página "${summary.pageName}"` : 'Nada a fazer',
    'success',
  )

  kitResultEl.replaceChildren()

  if (summary.created.length > 0) {
    kitResultEl.append(nameList('Criados', summary.created, 'success'))
  }
  if (summary.skipped.length > 0) {
    kitResultEl.append(nameList('Já existiam', summary.skipped, null))
  }
  if (summary.warnings.length > 0) {
    kitResultEl.append(nameList('Avisos', summary.warnings, 'warning'))
  }
}

function nameList(title: string, items: string[], severity: 'success' | 'warning' | null): DocumentFragment {
  const fragment = document.createDocumentFragment()

  const heading = document.createElement('p')
  heading.className = 'section-title'
  heading.append(document.createTextNode(title))

  const pill = document.createElement('span')
  pill.className = 'count-pill'
  pill.textContent = String(items.length)
  heading.append(pill)
  fragment.append(heading)

  const list = document.createElement('ul')

  for (const item of items) {
    const li = document.createElement('li')
    if (severity !== null) li.className = severity

    const bar = document.createElement('div')
    bar.className = 'bar'
    li.append(bar)

    const body = document.createElement('div')
    body.className = 'body'
    // textContent, nunca innerHTML: nome de componente é conteúdo de designer.
    body.textContent = item
    li.append(body)

    list.append(li)
  }

  fragment.append(list)
  return fragment
}

function setKitStatus(message: string, kind: 'error' | 'success' | null): void {
  kitStatusEl.textContent = message
  kitStatusEl.className = kind === null ? 'status' : `status ${kind}`
}

function render(result: ScanResult): void {
  const errors = result.diagnostics.filter((item) => item.severity === 'error')
  const warnings = result.diagnostics.filter((item) => item.severity !== 'error')

  if (result.screenName !== null) {
    screenNameEl.textContent = result.screenName
    screenNameEl.classList.remove('unset')
    canvasSizeEl.textContent = `${result.canvasWidth} x ${result.canvasHeight} px`
  } else {
    screenNameEl.textContent = 'Nenhuma tela selecionada'
    screenNameEl.classList.add('unset')
    canvasSizeEl.textContent = 'Selecione o frame "screen/..."'
  }

  stats.nodes.textContent = String(result.nodeCount)
  stats.components.textContent = String(result.componentCount)
  stats.binds.textContent = String(result.bindCount)
  stats.assets.textContent = String(result.assetCount)

  reportEl.replaceChildren()

  if (errors.length > 0) {
    reportEl.append(section('Erros', errors, 'Corrija para poder exportar.'))
  }
  if (warnings.length > 0) {
    reportEl.append(section('Avisos', warnings, null))
  }
  if (errors.length === 0 && warnings.length === 0) {
    reportEl.append(
      result.screenName !== null
        ? emptyState('Tudo certo', 'Nenhum problema encontrado. Pode exportar.')
        : emptyState(
            'Nada para analisar',
            'Selecione o frame raiz da tela, aquele nomeado "screen/NomeDaTela".',
          ),
    )
  }

  const blocked = errors.length > 0 || result.screenName === null
  exportButton.disabled = blocked
  exportButton.textContent = result.screenName !== null ? `Exportar ${result.screenName}` : 'Exportar'

  if (blocked) {
    setStatus(errors.length > 0 ? `${errors.length} erro(s) bloqueando o export` : '', errors.length > 0 ? 'error' : null)
  } else {
    setStatus('', null)
  }
}

function section(title: string, items: Diagnostic[], hint: string | null): DocumentFragment {
  const fragment = document.createDocumentFragment()

  const heading = document.createElement('p')
  heading.className = 'section-title'
  heading.append(document.createTextNode(title))

  const pill = document.createElement('span')
  pill.className = 'count-pill'
  pill.textContent = String(items.length)
  heading.append(pill)
  fragment.append(heading)

  if (hint !== null) {
    const hintEl = document.createElement('div')
    hintEl.className = 'message'
    hintEl.style.margin = '-4px 0 8px'
    hintEl.textContent = hint
    fragment.append(hintEl)
  }

  const list = document.createElement('ul')
  for (const item of items) {
    list.append(diagnosticItem(item))
  }
  fragment.append(list)

  return fragment
}

function diagnosticItem(item: Diagnostic): HTMLLIElement {
  const li = document.createElement('li')
  li.className = item.severity

  const bar = document.createElement('div')
  bar.className = 'bar'
  li.append(bar)

  const body = document.createElement('div')
  body.className = 'body'

  if (item.nodeName !== undefined) {
    const name = document.createElement('div')
    name.className = 'node-name'
    // textContent, nunca innerHTML: nome de layer e conteudo de designer.
    name.textContent = item.nodeName
    body.append(name)
  }

  const message = document.createElement('div')
  message.className = 'message'
  message.textContent = item.message
  body.append(message)

  const rule = document.createElement('span')
  rule.className = 'rule'
  rule.textContent = item.rule
  body.append(rule)

  li.append(body)

  const nodeId = item.nodeId
  if (nodeId !== undefined) {
    li.classList.add('clickable')
    li.title = 'Clique para localizar no canvas'
    li.addEventListener('click', () => {
      send({ type: 'select-node', nodeId })
    })
  }

  return li
}

function emptyState(title: string, message: string): HTMLDivElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'empty'

  const strong = document.createElement('strong')
  strong.textContent = title
  wrapper.append(strong)
  wrapper.append(document.createTextNode(message))

  return wrapper
}

function setStatus(message: string, kind: 'error' | 'success' | null): void {
  statusEl.textContent = message
  statusEl.className = kind === null ? 'status' : `status ${kind}`
}

/**
 * Zipa e entrega o pacote. O sandbox do Figma nao tem Blob nem download, por isso a
 * compactacao acontece aqui no iframe.
 */
async function deliver(payload: ExportPayload): Promise<void> {
  try {
    const files: Record<string, Uint8Array> = { 'ui.json': strToU8(payload.json) }
    for (const asset of payload.assets) {
      files[asset.path] = asset.bytes
    }

    const zipped = zipSync(files, { level: 6 })

    // slice() garante um ArrayBuffer proprio: o buffer de um Uint8Array pode ser
    // compartilhado, e Blob nao aceita SharedArrayBuffer.
    const blob = new Blob([zipped.slice().buffer as ArrayBuffer], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)

    try {
      const link = document.createElement('a')
      link.href = url
      link.download = payload.fileName
      link.click()
    } finally {
      URL.revokeObjectURL(url)
    }

    const kb = (zipped.length / 1024).toFixed(0)
    setStatus(`${payload.fileName} salvo (${kb} kb)`, 'success')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'error')
  } finally {
    exportButton.disabled = current === null || current.screenName === null
  }
}
