import type { Diagnostic } from './uiir'

/** Mensagens da UI (iframe) para o sandbox. */
export type UiToSandbox =
  | { type: 'rescan' }
  | { type: 'export' }
  /** Exporta a selecao como componente do kit. `role` ausente deixa o nome inferir. */
  | { type: 'export-component'; role?: string }
  /** `only` ausente cria o kit inteiro; informado, cria só os nomes canônicos listados. */
  | { type: 'create-kit'; only?: readonly string[] }
  /** Componente fora do kit canônico: o designer escolhe nome e papel. */
  | { type: 'create-component'; name: string; role: string }
  /** Cria uma tela avulsa na página atual. `name` é o sufixo cru, sem o prefixo `screen/`. */
  | { type: 'create-screen'; name: string }
  | { type: 'get-palette' }
  | { type: 'set-color'; key: string; hex: string }
  /** `name` vira a chave da cor nova, depois de normalizada. */
  | { type: 'add-color'; name: string; hex: string }
  | { type: 'remove-color'; key: string }
  /** Exporta todo componente da página atual num só pacote `.uikitset`. */
  | { type: 'export-kit-batch' }
  | { type: 'select-node'; nodeId: string }
  | { type: 'close' }

/** Resumo de uma varredura, sem exportar imagem nenhuma — roda a cada troca de selecao. */
export interface ScanResult {
  screenName: string | null
  canvasWidth: number
  canvasHeight: number
  nodeCount: number
  assetCount: number
  bindCount: number
  componentCount: number
  diagnostics: Diagnostic[]
}

/** Varredura de um componente selecionado. Espelha ScanResult, para o outro tipo de export. */
export interface ComponentScanResult {
  canonicalName: string | null
  role: string | null
  width: number
  height: number
  nodeCount: number
  assetCount: number
  /** Nomes dos slots encontrados, para o designer conferir antes de exportar. */
  slots: string[]
  diagnostics: Diagnostic[]
}

export interface PackedAsset {
  /** Caminho dentro do zip. Sempre 'images/<arquivo>.png'. */
  path: string
  bytes: Uint8Array
}

export interface ExportPayload {
  fileName: string
  /**
   * Nome da entrada JSON dentro do zip: `ui.json` numa tela, `kit.json` num componente.
   *
   * E o discriminador do pacote. O importador da Unity decide por ele se monta uma tela ou
   * um prefab do kit, em vez de inferir pelo conteudo.
   */
  jsonEntry: string
  json: string
  assets: PackedAsset[]
}

export interface KitSummary {
  pageName: string
  created: string[]
  skipped: string[]
  stylesCreated: number
  warnings: string[]
}

/**
 * Uma cor da paleta do kit, como a aba Cores mostra.
 *
 * Forma estrutural própria (não importada de `palette.ts`) porque este arquivo precisa
 * continuar livre de API do Figma — a UI do plugin roda num bundle separado que não pode
 * tocar `figma.*`.
 */
export interface PaletteEntry {
  key: string
  hex: string
  /** Uma das chaves centrais do kit — protegida contra remoção, não contra recoloração. */
  core: boolean
  /** false quando é uma chave central que ainda não tem Paint Style no arquivo. */
  exists: boolean
}

export interface KitBatchExportPayload {
  /** `<nome-da-pagina>.uikitset`. */
  fileName: string
  /** JSON já formatado do `kitset.json` que vai na raiz do zip. */
  manifestJson: string
  /** `path` já é `components/<slug>/kit.json`. */
  components: { path: string; json: string }[]
  /** `path` já inclui `components/<slug>/images/<arquivo>.png`. */
  assets: PackedAsset[]
}

/** Mensagens do sandbox para a UI (iframe). */
export type SandboxToUi =
  | { type: 'scanned'; result: ScanResult }
  | { type: 'component-scanned'; result: ComponentScanResult }
  | { type: 'export-ready'; payload: ExportPayload }
  | { type: 'kit-created'; summary: KitSummary }
  | { type: 'palette'; colors: PaletteEntry[] }
  | { type: 'kit-batch-ready'; payload: KitBatchExportPayload }
  | { type: 'busy'; label: string }
  | { type: 'failed'; message: string }
