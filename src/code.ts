import { createKit } from './kit-builder'
import type { SandboxToUi, ScanResult, UiToSandbox } from './messages'
import { build } from './traverse'

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

async function scan(): Promise<void> {
  const generation = ++scanGeneration

  try {
    const result = await build(figma.currentPage.selection, {
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
        json: JSON.stringify(result.ir, null, 2),
        assets: result.assets,
      },
    })
  } catch (error) {
    post({ type: 'failed', message: describeError(error) })
  }
}

async function buildKit(): Promise<void> {
  post({ type: 'busy', label: 'Criando componentes...' })

  try {
    const result = await createKit()
    post({ type: 'kit-created', summary: result })
  } catch (error) {
    post({ type: 'failed', message: describeError(error) })
    return
  }

  // A criação troca a página atual, e com ela a seleção: reanalisar evita a UI continuar
  // mostrando o relatório de uma tela que já não está selecionada.
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
    case 'create-kit':
      void buildKit()
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
