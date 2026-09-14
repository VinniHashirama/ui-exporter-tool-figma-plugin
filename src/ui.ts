import { strToU8, zipSync } from 'fflate'
import { CUSTOM_ROLES, KIT_CATALOG, ROLE_LABELS } from './kit'
import type {
  ComponentScanResult,
  ExportPayload,
  KitSummary,
  SandboxToUi,
  ScanResult,
  UiToSandbox,
} from './messages'
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
const componentPanel = el('panel-component')
const kitTab = el<HTMLButtonElement>('tab-kit')
const exportTab = el<HTMLButtonElement>('tab-export')
const componentTab = el<HTMLButtonElement>('tab-component')

const componentNameEl = el('component-name')
const componentSizeEl = el('component-size')
const componentReportEl = el('component-report')
const componentStatusEl = el('component-status')
const componentRoleEl = el<HTMLSelectElement>('component-role')
const exportComponentButton = el<HTMLButtonElement>('export-component')

const componentStats = {
  nodes: el('stat-component-nodes'),
  slots: el('stat-component-slots'),
  assets: el('stat-component-assets'),
}
const kitButton = el<HTMLButtonElement>('create-kit')
const kitStatusEl = el('kit-status')
const kitResultEl = el('kit-result')
const kitListEl = el('kit-list')
const customNameEl = el<HTMLInputElement>('custom-name')
const customRoleEl = el<HTMLSelectElement>('custom-role')
const customButton = el<HTMLButtonElement>('create-custom')

/** Botões de criação por componente, para poder desabilitar todos enquanto um roda. */
const kitRowButtons: HTMLButtonElement[] = []

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
  startKitWork('Criando componentes...')
  send({ type: 'create-kit' })
})

/**
 * Trava os dois caminhos de criação enquanto um roda.
 *
 * Dois pedidos concorrentes mexeriam na mesma página e o segundo veria um estado
 * intermediário do primeiro — inclusive a checagem de "já existe".
 */
function startKitWork(label: string): void {
  kitButton.disabled = true
  customButton.disabled = true
  for (const button of kitRowButtons) button.disabled = true
  setKitStatus(label, null)
  kitResultEl.replaceChildren()
}

function endKitWork(): void {
  kitButton.disabled = false
  customButton.disabled = false
  for (const button of kitRowButtons) button.disabled = false
}

function renderRoles(): void {
  for (const target of [customRoleEl, componentRoleEl]) {
    for (const role of CUSTOM_ROLES) {
      const option = document.createElement('option')
      option.value = role
      option.textContent = ROLE_LABELS[role]
      target.append(option)
    }
  }
}

function submitCustom(): void {
  const name = customNameEl.value.trim()

  if (name.length === 0) {
    setKitStatus('Dê um nome ao componente, por exemplo "HUD/StatBar".', 'error')
    customNameEl.focus()
    return
  }

  startKitWork(`Criando ${name}...`)
  send({ type: 'create-component', name, role: customRoleEl.value })
}

customButton.addEventListener('click', submitCustom)

customNameEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') submitCustom()
})

function renderKitCatalog(): void {
  kitListEl.replaceChildren()

  for (const group of KIT_CATALOG) {
    const title = document.createElement('p')
    title.className = 'kit-group-title'
    title.textContent = group.title
    kitListEl.append(title)

    for (const name of group.items) {
      const row = document.createElement('div')
      row.className = 'kit-row'

      const label = document.createElement('span')
      label.className = 'kit-row-name'
      // textContent, nunca innerHTML: mesmo sendo constante nossa, a regra vale para tudo
      // que entra no DOM da UI.
      label.textContent = name
      row.append(label)

      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = 'Criar'
      button.title = `Criar só ${name} nesta página`
      button.addEventListener('click', () => {
        startKitWork(`Criando ${name}...`)
        send({ type: 'create-kit', only: [name] })
      })

      kitRowButtons.push(button)
      row.append(button)
      kitListEl.append(row)
    }
  }
}

renderKitCatalog()
renderRoles()

type Tab = 'export' | 'component' | 'kit'

const TABS: ReadonlyArray<{ id: Tab; tab: HTMLButtonElement; panel: HTMLElement }> = [
  { id: 'export', tab: exportTab, panel: exportPanel },
  { id: 'component', tab: componentTab, panel: componentPanel },
  { id: 'kit', tab: kitTab, panel: kitPanel },
]

for (const entry of TABS) {
  entry.tab.addEventListener('click', () => selectTab(entry.id))
}

/** true depois que o usuario clica numa aba: a partir dai a selecao para de trocar sozinha. */
let tabPinned = false

function selectTab(mode: Tab, byUser = true): void {
  if (byUser) tabPinned = true

  for (const entry of TABS) {
    const active = entry.id === mode
    entry.panel.hidden = !active
    entry.tab.setAttribute('aria-selected', String(active))
  }
}

/**
 * Leva para a aba do que foi selecionado, ate o usuario escolher uma aba na mao.
 *
 * Selecionar um componente e continuar vendo "nenhuma tela selecionada" faria o plugin
 * parecer quebrado. Depois de uma escolha explicita, respeitar essa escolha.
 */
function followSelection(mode: Tab): void {
  if (!tabPinned) selectTab(mode, false)
}

window.onmessage = (event: MessageEvent): void => {
  const message = (event.data as { pluginMessage?: SandboxToUi } | null)?.pluginMessage
  if (message === undefined) return

  switch (message.type) {
    case 'scanned':
      current = message.result
      render(message.result)
      if (message.result.screenName !== null) followSelection('export')
      break
    case 'component-scanned':
      renderComponent(message.result)
      if (message.result.canonicalName !== null) followSelection('component')
      break
    case 'busy':
      exportButton.disabled = true
      exportComponentButton.disabled = true
      setStatus(message.label, null)
      setComponentStatus(message.label, null)
      break
    case 'export-ready':
      void deliver(message.payload)
      break
    case 'kit-created':
      renderKitResult(message.summary)
      break
    case 'failed':
      // Um erro pode vir de qualquer um dos fluxos; mostrar em todos evita a mensagem
      // aparecer numa aba que o usuário não está olhando.
      setStatus(message.message, 'error')
      setComponentStatus(message.message, 'error')
      setKitStatus(message.message, 'error')
      exportButton.disabled = true
      exportComponentButton.disabled = true
      endKitWork()
      break
  }
}

exportComponentButton.addEventListener('click', () => {
  exportComponentButton.disabled = true
  setComponentStatus('Montando o pacote...', null)
  send({ type: 'export-component', role: componentRoleEl.value })
})

function renderComponent(result: ComponentScanResult): void {
  componentStats.nodes.textContent = String(result.nodeCount)
  componentStats.slots.textContent = String(result.slots.length)
  componentStats.assets.textContent = String(result.assetCount)

  const hasErrors = result.diagnostics.some((item) => item.severity === 'error')
  const ready = result.canonicalName !== null && !hasErrors

  exportComponentButton.disabled = !ready
  setComponentStatus('', null)

  if (result.canonicalName === null) {
    componentNameEl.textContent = 'Nenhum componente selecionado'
    componentNameEl.classList.add('unset')
    componentSizeEl.textContent = 'Selecione um Component ou Component Set'
  } else {
    componentNameEl.textContent = result.canonicalName
    componentNameEl.classList.remove('unset')
    componentSizeEl.textContent = `${result.width} x ${result.height} px`
  }

  // O papel vem inferido do nome; o designer pode trocar antes de exportar.
  if (result.role !== null) componentRoleEl.value = result.role

  componentReportEl.replaceChildren()

  if (result.slots.length > 0) {
    const heading = document.createElement('p')
    heading.className = 'section-title'
    heading.textContent = 'Slots'
    componentReportEl.append(heading)

    const chips = document.createElement('div')
    chips.className = 'slot-chips'

    for (const slot of result.slots) {
      const chip = document.createElement('span')
      chip.className = 'slot-chip'
      chip.textContent = slot
      chips.append(chip)
    }

    componentReportEl.append(chips)
  }

  const errors = result.diagnostics.filter((item) => item.severity === 'error')
  const warnings = result.diagnostics.filter((item) => item.severity !== 'error')

  if (errors.length > 0) {
    componentReportEl.append(section('Erros', errors, 'Corrija para poder exportar.'))
  }
  if (warnings.length > 0) {
    componentReportEl.append(section('Avisos', warnings, null))
  }
  if (errors.length === 0 && warnings.length === 0) {
    componentReportEl.append(
      result.canonicalName !== null
        ? emptyState('Tudo certo', 'Nenhum problema encontrado. Pode exportar.')
        : emptyState(
            'Nada para analisar',
            'Selecione o componente que você quer levar para a Unity. Se ainda for um frame ' +
              'comum, transforme em Component primeiro.',
          ),
    )
  }

  exportComponentButton.textContent =
    result.canonicalName !== null ? `Exportar ${result.canonicalName}` : 'Exportar componente'

  if (errors.length > 0) {
    setComponentStatus(`${errors.length} erro(s) bloqueando o export`, 'error')
  }
}

function setComponentStatus(message: string, severity: 'error' | 'success' | null): void {
  componentStatusEl.textContent = message
  componentStatusEl.className = severity === null ? 'status' : `status ${severity}`
}

function renderKitResult(summary: KitSummary): void {
  endKitWork()

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
    const files: Record<string, Uint8Array> = { [payload.jsonEntry]: strToU8(payload.json) }
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
