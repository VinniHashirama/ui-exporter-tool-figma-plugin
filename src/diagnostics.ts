import type { Diagnostic, Severity } from './uiir'

/**
 * Regras de lint. Os nomes precisam bater com a tabela de https://github.com/VinniHashirama/ui-exporter-tool-docs-and-samples/blob/main/docs/figma-conventions.md —
 * o designer le aquela tabela para entender o que fazer.
 */
export const RULES = {
  // Erros: bloqueiam o export.
  emptySelection: 'empty-selection',
  rootFrameName: 'root-frame-name',
  duplicateBind: 'duplicate-bind',
  invalidBind: 'invalid-bind',
  // Avisos: passam, mas alguem paga depois.
  defaultLayerName: 'default-layer-name',
  unknownComponent: 'unknown-component',
  unsupportedEffect: 'unsupported-effect',
  complexVector: 'complex-vector',
  hardcodedColor: 'hardcoded-color',
  hardcodedTypography: 'hardcoded-typography',
  spaceBetween: 'space-between',
  layoutWrap: 'layout-wrap',
  rotatedNode: 'rotated-node',
  detachedInstance: 'detached-instance',
  mixedTextStyles: 'mixed-text-styles',
  unsupportedTextCase: 'unsupported-text-case',
  multipleFills: 'multiple-fills',
  mixedFills: 'mixed-fills',
  emptyScreen: 'empty-screen',
} as const

/** Acumula diagnosticos e responde se o export pode seguir. */
export class DiagnosticBag {
  private readonly items: Diagnostic[] = []
  private readonly seen = new Set<string>()

  add(severity: Severity, rule: string, message: string, node?: { id: string; name: string }): void {
    // Uma mesma regra no mesmo node so entra uma vez: sem isso, uma tela grande gera
    // centenas de linhas repetidas e o report fica ilegivel.
    const key = `${rule}|${node?.id ?? '-'}`
    if (this.seen.has(key)) return
    this.seen.add(key)

    const item: Diagnostic = { severity, rule, message }
    if (node !== undefined) {
      item.nodeId = node.id
      item.nodeName = node.name
    }
    this.items.push(item)
  }

  error(rule: string, message: string, node?: { id: string; name: string }): void {
    this.add('error', rule, message, node)
  }

  warn(rule: string, message: string, node?: { id: string; name: string }): void {
    this.add('warning', rule, message, node)
  }

  info(rule: string, message: string, node?: { id: string; name: string }): void {
    this.add('info', rule, message, node)
  }

  get all(): readonly Diagnostic[] {
    return this.items
  }

  get hasErrors(): boolean {
    return this.items.some((item) => item.severity === 'error')
  }

  /** Erros primeiro, depois avisos, depois info. Ordem estavel dentro de cada nivel. */
  sorted(): Diagnostic[] {
    const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 }
    return [...this.items].sort((a, b) => rank[a.severity] - rank[b.severity])
  }
}
