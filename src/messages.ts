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

/** Mensagens do sandbox para a UI (iframe). */
export type SandboxToUi =
  | { type: 'scanned'; result: ScanResult }
  | { type: 'component-scanned'; result: ComponentScanResult }
  | { type: 'export-ready'; payload: ExportPayload }
  | { type: 'kit-created'; summary: KitSummary }
  | { type: 'busy'; label: string }
  | { type: 'failed'; message: string }
