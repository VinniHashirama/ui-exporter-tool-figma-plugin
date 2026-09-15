import { isCustomRole } from './kit'
import { assetPath, buildKitBatchManifest, componentPath } from './kit-batch'
import { bottomOf, buildScreenFrame, createCustomComponent, createKit } from './kit-builder'
import type { PackedAsset, SandboxToUi, ScanResult, UiToSandbox } from './messages'
import { isValidScreenSuffix, parseScreenName, sanitizeName, toKebab } from './naming'
import { hexToRgb, isCorePaletteKey, loadPalette, removePaletteColor, upsertPaletteColor } from './palette'
import { build, buildComponent, readSource } from './traverse'
import { PLUGIN_VERSION, SCHEMA_VERSION } from './uiir'

/** @2x cobre densidade de tela mobile sem dobrar o peso do pacote como @3x faria. */
const ASSET_SCALE = 2

figma.showUI(__html__, { width: 400, height: 620, themeColors: true })

function post(message: SandboxToUi): void {
  figma.ui.postMessage(message)
}

/**
 * Uma troca de selecao pode chegar no meio de uma varredura. O contador descarta o
 * resultado obsoleto em vez de deixar a UI piscar entre dois estados.
 */
let scanGeneration = 0

/**
 * A selecao e uma tela ou um componente?
 *
 * Um COMPONENT chamado `screen/Algo` e tela: a convencao de nome e explicita e ganha do tipo
 * do node. Fora isso, componente e component set sao componente. Discriminar aqui evita
 * rodar as duas varreduras a cada troca de selecao.
 */
function isComponentSelection(selection: readonly SceneNode[]): boolean {
  if (selection.length !== 1) return false

  const node = selection[0]!
  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') return false

  return parseScreenName(node.name) === null
}

async function scan(): Promise<void> {
  const generation = ++scanGeneration
  const selection = figma.currentPage.selection

  try {
    if (isComponentSelection(selection)) {
      const result = await buildComponent(selection, {
        exportAssets: false,
        assetScale: ASSET_SCALE,
        deriveSlices: true,
      })

      if (generation !== scanGeneration) return

      post({
        type: 'component-scanned',
        result: {
          canonicalName: result.canonicalName,
          role: result.ir?.kit?.role ?? null,
          width: result.ir?.canvas.width ?? 0,
          height: result.ir?.canvas.height ?? 0,
          nodeCount: result.nodeCount,
          assetCount: result.ir?.assets.length ?? 0,
          slots: result.ir?.kit?.slots.map((slot) => slot.name) ?? [],
          diagnostics: result.bag.sorted(),
        },
      })
      return
    }

    const result = await build(selection, {
      exportAssets: false,
      assetScale: ASSET_SCALE,
    })

    if (generation !== scanGeneration) return

    const scanned: ScanResult = {
      screenName: result.screenName,
      canvasWidth: result.ir?.canvas.width ?? 0,
      canvasHeight: result.ir?.canvas.height ?? 0,
      nodeCount: result.nodeCount,
      assetCount: result.ir?.assets.length ?? 0,
      bindCount: result.bindCount,
      componentCount: result.componentCount,
      diagnostics: result.bag.sorted(),
    }
    post({ type: 'scanned', result: scanned })
  } catch (error) {
    if (generation !== scanGeneration) return
    post({ type: 'failed', message: describeError(error) })
  }
}

async function exportScreen(): Promise<void> {
  post({ type: 'busy', label: 'Montando o pacote...' })

  try {
    const result = await build(figma.currentPage.selection, {
      exportAssets: true,
      assetScale: ASSET_SCALE,
    })

    if (result.ir === null || result.screenName === null || result.bag.hasErrors) {
      // Volta para o relatorio: os erros explicam por que nao exportou.
      post({
        type: 'scanned',
        result: {
          screenName: result.screenName,
          canvasWidth: result.ir?.canvas.width ?? 0,
          canvasHeight: result.ir?.canvas.height ?? 0,
          nodeCount: result.nodeCount,
          assetCount: result.ir?.assets.length ?? 0,
          bindCount: result.bindCount,
          componentCount: result.componentCount,
          diagnostics: result.bag.sorted(),
        },
      })
      return
    }

    post({
      type: 'export-ready',
      payload: {
        fileName: `${result.screenName}.uiexport`,
        jsonEntry: 'ui.json',
        json: JSON.stringify(result.ir, null, 2),
        assets: result.assets,
      },
    })
  } catch (error) {
    post({ type: 'failed', message: describeError(error) })
  }
}

/**
 * Exporta a selecao como pacote de componente.
 *
 * Extensao e entrada JSON diferentes das de tela, de proposito: um pacote de componente
 * nunca deve ser aberto como tela por engano, e o importador roteia por elas em vez de
 * adivinhar pelo conteudo.
 */
async function exportComponent(role: string | undefined): Promise<void> {
  post({ type: 'busy', label: 'Montando o pacote do componente...' })

  try {
    const result = await buildComponent(figma.currentPage.selection, {
      exportAssets: true,
      assetScale: ASSET_SCALE,
      deriveSlices: true,
      role: role !== undefined && isCustomRole(role) ? role : undefined,
    })

    if (result.ir === null || result.canonicalName === null || result.bag.hasErrors) {
      post({
        type: 'component-scanned',
        result: {
          canonicalName: result.canonicalName,
          role: result.ir?.kit?.role ?? null,
          width: result.ir?.canvas.width ?? 0,
          height: result.ir?.canvas.height ?? 0,
          nodeCount: result.nodeCount,
          assetCount: result.ir?.assets.length ?? 0,
          slots: result.ir?.kit?.slots.map((slot) => slot.name) ?? [],
          diagnostics: result.bag.sorted(),
        },
      })
      return
    }

    post({
      type: 'export-ready',
      payload: {
        // `Button/Primary` -> `Button_Primary.uikit`: '/' nao pode ir para nome de arquivo.
        fileName: `${result.canonicalName.split('/').join('_')}.uikit`,
        jsonEntry: 'kit.json',
        json: JSON.stringify(result.ir, null, 2),
        assets: result.assets,
      },
    })
  } catch (error) {
    post({ type: 'failed', message: describeError(error) })
  }
}

async function buildKit(only?: readonly string[]): Promise<void> {
  post({
    type: 'busy',
    label: only === undefined ? 'Criando componentes...' : `Criando ${only.join(', ')}...`,
  })

  try {
    const result = await createKit(only)
    post({ type: 'kit-created', summary: result })
  } catch (error) {
    post({ type: 'failed', message: describeError(error) })
    return
  }

  // A criação troca a página atual, e com ela a seleção: reanalisar evita a UI continuar
  // mostrando o relatório de uma tela que já não está selecionada.
  void scan()
}

async function buildCustom(name: string, role: string): Promise<void> {
  // A UI só oferece papéis válidos, mas ela é outro contexto: validar aqui evita que um
  // valor inesperado caia num `switch` sem caso e quebre no meio da criação.
  if (!isCustomRole(role)) {
    post({ type: 'failed', message: `Papel '${role}' não existe.` })
    return
  }

  post({ type: 'busy', label: `Criando ${name}...` })

  try {
    const result = await createCustomComponent(name, role)
    post({ type: 'kit-created', summary: result })
  } catch (error) {
    post({ type: 'failed', message: describeError(error) })
    return
  }

  void scan()
}

/**
 * Cria uma tela avulsa na página atual — não na página `UI Kit`, porque tela de verdade vive
 * onde o designer está trabalhando, ao contrário dos componentes e do template do kit.
 */
async function createScreen(rawName: string): Promise<void> {
  // A UI já valida antes de mandar, mas ela é outro contexto: revalidar aqui evita que um
  // nome fora do padrão `screen/(Letra)(Letras|Dígitos|_)*` chegue a virar frame.
  if (!isValidScreenSuffix(rawName)) {
    post({
      type: 'failed',
      message:
        `'${rawName}' não é um nome válido de tela. Comece com uma letra e use só letras, ` +
        'números e "_" depois dela.',
    })
    return
  }

  const name = `screen/${rawName.trim()}`

  if (figma.currentPage.children.some((node) => node.name === name)) {
    post({ type: 'failed', message: `Já existe um frame "${name}" nesta página.` })
    return
  }

  post({ type: 'busy', label: `Criando ${name}...` })

  try {
    const palette = await loadPalette()
    const backgroundHex = palette.find((entry) => entry.key === 'background')?.hex
    // `loadPalette` sempre sintetiza a chave `background`, mesmo sem estilo — então isto só
    // falha se a paleta mudou de forma, e um valor deveria continuar existindo.
    const background = backgroundHex !== undefined ? hexToRgb(backgroundHex) : null

    const styles = await figma.getLocalPaintStylesAsync()
    const backgroundStyle = styles.find((style) => style.name === 'color/background')

    const warnings: string[] = []
    const frame = await buildScreenFrame(
      name,
      background ?? { r: 0.07, g: 0.08, b: 0.12 },
      backgroundStyle,
      warnings,
    )

    figma.currentPage.appendChild(frame)
    frame.x = 0
    frame.y = bottomOf(figma.currentPage, 64)

    figma.currentPage.selection = [frame]
    figma.viewport.scrollAndZoomIntoView([frame])
  } catch (error) {
    post({ type: 'failed', message: describeError(error) })
    return
  }

  // Mesmo motivo do buildKit/buildCustom: a nova tela virou a seleção, e a UI precisa do
  // relatório dela em vez de continuar mostrando "nenhuma tela selecionada".
  void scan()
}

async function getPalette(): Promise<void> {
  try {
    const colors = await loadPalette()
    post({ type: 'palette', colors })
  } catch (error) {
    post({ type: 'failed', message: describeError(error) })
  }
}

async function setColor(key: string, hex: string): Promise<void> {
  if (hexToRgb(hex) === null) {
    post({ type: 'failed', message: `'${hex}' não é uma cor hexadecimal válida. Use o formato #rrggbb.` })
    return
  }

  try {
    await upsertPaletteColor(key, hex)
    await getPalette()
  } catch (error) {
    post({ type: 'failed', message: describeError(error) })
  }
}

async function addColor(rawName: string, hex: string): Promise<void> {
  const key = toKebab(rawName)

  if (key.length === 0) {
    post({ type: 'failed', message: 'Dê um nome à cor, por exemplo "hud-danger".' })
    return
  }

  if (hexToRgb(hex) === null) {
    post({ type: 'failed', message: `'${hex}' não é uma cor hexadecimal válida. Use o formato #rrggbb.` })
    return
  }

  if (isCorePaletteKey(key)) {
    post({
      type: 'failed',
      message: `'${key}' já é uma cor base do kit. Use o campo dela na lista para recolorir.`,
    })
    return
  }

  const existing = await loadPalette()
  if (existing.some((entry) => entry.key === key)) {
    post({ type: 'failed', message: `Já existe uma cor '${key}'.` })
    return
  }

  try {
    await upsertPaletteColor(key, hex)
    await getPalette()
  } catch (error) {
    post({ type: 'failed', message: describeError(error) })
  }
}

async function removeColor(key: string): Promise<void> {
  if (isCorePaletteKey(key)) {
    post({ type: 'failed', message: 'Cores base não podem ser removidas, só recoloridas.' })
    return
  }

  try {
    await removePaletteColor(key)
    await getPalette()
  } catch (error) {
    post({ type: 'failed', message: describeError(error) })
  }
}

/**
 * Exporta todo componente de primeiro nível da página atual num só pacote `.uikitset`, pra a
 * Unity atualizar o kit inteiro de uma vez e manter os componentes em sincronia entre si.
 *
 * Só nós de primeiro nível: igual ao `collectExistingNames` do kit-builder, instância e
 * componente aninhado dentro de outro não contam — senão o mesmo componente apareceria
 * exportado mais de uma vez.
 */
async function exportKitBatch(): Promise<void> {
  const page = figma.currentPage
  const candidates = page.children.filter(
    (node): node is ComponentNode | ComponentSetNode =>
      node.type === 'COMPONENT' || node.type === 'COMPONENT_SET',
  )

  if (candidates.length === 0) {
    post({ type: 'failed', message: 'Nenhum componente exportável nesta página.' })
    return
  }

  post({ type: 'busy', label: `Exportando ${candidates.length} componente(s)...` })

  const components: { canonicalName: string }[] = []
  const componentFiles: { path: string; json: string }[] = []
  const assets: PackedAsset[] = []
  const skipped: { name: string; reason: string }[] = []

  try {
    for (const node of candidates) {
      const result = await buildComponent([node], {
        exportAssets: true,
        assetScale: ASSET_SCALE,
        deriveSlices: true,
      })

      if (result.ir === null || result.canonicalName === null || result.bag.hasErrors) {
        const firstError = result.bag.sorted().find((item) => item.severity === 'error')
        skipped.push({
          name: result.canonicalName ?? node.name,
          reason: firstError?.message ?? 'Não foi possível exportar este componente.',
        })
        continue
      }

      const canonicalName = result.canonicalName
      components.push({ canonicalName })
      componentFiles.push({
        path: componentPath(canonicalName),
        json: JSON.stringify(result.ir, null, 2),
      })

      for (const asset of result.assets) {
        assets.push({ path: assetPath(canonicalName, asset.path), bytes: asset.bytes })
      }
    }
  } catch (error) {
    post({ type: 'failed', message: describeError(error) })
    return
  }

  if (components.length === 0) {
    post({ type: 'failed', message: 'Nenhum componente exportável nesta página.' })
    return
  }

  const source = readSource()
  const manifest = buildKitBatchManifest(
    { fileKey: source.fileKey, fileName: source.fileName, pageName: page.name },
    SCHEMA_VERSION,
    PLUGIN_VERSION,
    new Date().toISOString(),
    components,
    skipped,
  )

  post({
    type: 'kit-batch-ready',
    payload: {
      fileName: `${sanitizeName(page.name)}.uikitset`,
      manifestJson: JSON.stringify(manifest, null, 2),
      components: componentFiles,
      assets,
    },
  })
}

figma.ui.onmessage = (message: UiToSandbox): void => {
  switch (message.type) {
    case 'rescan':
      void scan()
      break
    case 'export':
      void exportScreen()
      break
    case 'export-component':
      void exportComponent(message.role)
      break
    case 'create-kit':
      void buildKit(message.only)
      break
    case 'create-component':
      void buildCustom(message.name, message.role)
      break
    case 'create-screen':
      void createScreen(message.name)
      break
    case 'get-palette':
      void getPalette()
      break
    case 'set-color':
      void setColor(message.key, message.hex)
      break
    case 'add-color':
      void addColor(message.name, message.hex)
      break
    case 'remove-color':
      void removeColor(message.key)
      break
    case 'export-kit-batch':
      void exportKitBatch()
      break
    case 'select-node':
      void revealNode(message.nodeId)
      break
    case 'close':
      figma.closePlugin()
      break
  }
}

/**
 * Leva a viewport ate o node sem mexer na selecao: trocar a selecao disparia uma nova
 * varredura e o relatorio da tela seria substituido pelo do node clicado.
 */
async function revealNode(nodeId: string): Promise<void> {
  try {
    const node = await figma.getNodeByIdAsync(nodeId)
    if (node === null || node.type === 'DOCUMENT' || node.type === 'PAGE') return
    figma.viewport.scrollAndZoomIntoView([node])
  } catch {
    // Node apagado entre a varredura e o clique: nada a fazer.
  }
}

figma.on('selectionchange', () => {
  void scan()
})

void scan()
void getPalette()

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
