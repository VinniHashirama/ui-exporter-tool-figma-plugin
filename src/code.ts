import { isCustomRole } from './kit'
import { createCustomComponent, createKit } from './kit-builder'
import type { SandboxToUi, ScanResult, UiToSandbox } from './messages'
import { parseScreenName } from './naming'
import { build, buildComponent } from './traverse'

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

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
