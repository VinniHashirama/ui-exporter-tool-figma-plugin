import type { Diagnostic } from './uiir'

/** Mensagens da UI (iframe) para o sandbox. */
export type UiToSandbox =
  | { type: 'rescan' }
  | { type: 'export' }
  | { type: 'create-kit' }
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

export interface PackedAsset {
  /** Caminho dentro do zip. Sempre 'images/<arquivo>.png'. */
  path: string
  bytes: Uint8Array
}

export interface ExportPayload {
  fileName: string
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
  | { type: 'export-ready'; payload: ExportPayload }
  | { type: 'kit-created'; summary: KitSummary }
  | { type: 'busy'; label: string }
  | { type: 'failed'; message: string }
