import type { DiagnosticBag } from '../diagnostics'
import { RULES } from '../diagnostics'
import type { Edges, Layout, LayoutChild, Sizing, SizingMode } from '../uiir'
import { round } from './geometry'

/** Node que participa de Auto Layout (frame, component, component set, instancia). */
type AutoLayoutNode = SceneNode & {
  layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL'
  layoutWrap?: 'NO_WRAP' | 'WRAP'
  itemSpacing: number
  paddingTop: number
  paddingRight: number
  paddingBottom: number
  paddingLeft: number
  primaryAxisAlignItems: 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN'
  counterAxisAlignItems: 'MIN' | 'MAX' | 'CENTER' | 'BASELINE'
  itemReverseZIndex?: boolean
}

export function hasAutoLayout(node: SceneNode): node is AutoLayoutNode {
  return 'layoutMode' in node && node.layoutMode !== 'NONE'
}

export function mapLayout(node: SceneNode, bag: DiagnosticBag): Layout | undefined {
  if (!hasAutoLayout(node)) return undefined

  const wrapped = node.layoutWrap === 'WRAP'
  // hasAutoLayout ja garante que layoutMode nao e NONE, mas o type predicate carrega o
  // tipo completo do Figma — por isso a escolha explicita em vez de repassar o valor.
  const mode: Layout['mode'] = wrapped ? 'WRAP' : node.layoutMode === 'VERTICAL' ? 'VERTICAL' : 'HORIZONTAL'

  if (wrapped) {
    bag.warn(
      RULES.layoutWrap,
      'Wrap nao tem equivalente em UGUI: vira grade de celulas iguais. Se os itens tem tamanhos diferentes, o resultado nao vai bater.',
      node,
    )
  }

  if (node.primaryAxisAlignItems === 'SPACE_BETWEEN') {
    bag.warn(
      RULES.spaceBetween,
      'Space between e aproximado com espacadores em UGUI. Prefira "Fill container" em um dos itens.',
      node,
    )
  }

  const padding: Edges = [
    round(node.paddingTop),
    round(node.paddingRight),
    round(node.paddingBottom),
    round(node.paddingLeft),
  ]

  const layout: Layout = {
    mode,
    padding,
    spacing: round(node.itemSpacing),
    primaryAlign: node.primaryAxisAlignItems,
    counterAlign: node.counterAxisAlignItems,
    sizing: readSizing(node),
  }

  if (node.itemReverseZIndex === true) layout.reverseZIndex = true

  return layout
}

/** Como ESTE node se comporta dentro do Auto Layout do PAI. */
export function mapLayoutChild(node: SceneNode): LayoutChild {
  const child: LayoutChild = { sizing: readSizing(node) }

  const grow = 'layoutGrow' in node ? node.layoutGrow : 0
  if (typeof grow === 'number' && grow > 0) child.grow = grow

  return child
}

/**
 * layoutSizingHorizontal/Vertical sao os campos modernos (FIXED/HUG/FILL) e mapeiam
 * direto para o que UGUI precisa. Sao acessiveis apenas em node que pode participar de
 * layout — por isso o try/catch em vez de checar tipo a tipo.
 */
function readSizing(node: SceneNode): Sizing {
  return {
    horizontal: readSizingAxis(node, 'layoutSizingHorizontal'),
    vertical: readSizingAxis(node, 'layoutSizingVertical'),
  }
}

function readSizingAxis(
  node: SceneNode,
  key: 'layoutSizingHorizontal' | 'layoutSizingVertical',
): SizingMode {
  try {
    const value = (node as unknown as Record<string, unknown>)[key]
    if (value === 'FIXED' || value === 'HUG' || value === 'FILL') return value
  } catch {
    // Node que nao suporta a propriedade: cai no default.
  }
  return 'FIXED'
}
