import type { Constraints, Rect } from '../uiir'

/**
 * Caixa do node relativa ao pai.
 *
 * Nao usamos node.x/node.y direto: dentro de um GROUP a origem depende da bounding box
 * do grupo, que se move sozinha quando os filhos mudam. Subtrair absoluteBoundingBox do
 * pai da o resultado certo em frame, group e instancia, sem caso especial.
 *
 * Para node rotacionado, absoluteBoundingBox e a caixa alinhada aos eixos, maior que o
 * node — por isso width/height vem de node.width/height. Rotacao gera aviso a parte.
 */
export function relativeRect(node: SceneNode, parent: BaseNode | null): Rect {
  const box = 'absoluteBoundingBox' in node ? node.absoluteBoundingBox : null
  const parentBox =
    parent !== null && 'absoluteBoundingBox' in parent
      ? (parent as SceneNode).absoluteBoundingBox
      : null

  if (box !== null && parentBox !== null) {
    return {
      x: round(box.x - parentBox.x),
      y: round(box.y - parentBox.y),
      width: round(node.width),
      height: round(node.height),
    }
  }

  // Sem bounding box (node fora de renderizacao) sobra a posicao local.
  return {
    x: round('x' in node ? node.x : 0),
    y: round('y' in node ? node.y : 0),
    width: round(node.width),
    height: round(node.height),
  }
}

/** Caixa do node raiz: a posicao dele na pagina nao interessa. */
export function rootRect(node: SceneNode): Rect {
  return { x: 0, y: 0, width: round(node.width), height: round(node.height) }
}

export function mapConstraints(node: SceneNode): Constraints | undefined {
  if (!('constraints' in node)) return undefined
  const { horizontal, vertical } = node.constraints
  return { horizontal, vertical }
}

export function mapCornerRadius(
  node: SceneNode,
): [number, number, number, number] | undefined {
  if (!('cornerRadius' in node)) return undefined

  const uniform = node.cornerRadius
  if (typeof uniform === 'number') {
    if (uniform <= 0) return undefined
    const r = round(uniform)
    return [r, r, r, r]
  }

  // figma.mixed: cantos individuais.
  const corners: [number, number, number, number] = [
    round(readCorner(node, 'topLeftRadius')),
    round(readCorner(node, 'topRightRadius')),
    round(readCorner(node, 'bottomRightRadius')),
    round(readCorner(node, 'bottomLeftRadius')),
  ]
  return corners.some((value) => value > 0) ? corners : undefined
}

type CornerKey =
  | 'topLeftRadius'
  | 'topRightRadius'
  | 'bottomRightRadius'
  | 'bottomLeftRadius'

function readCorner(node: SceneNode, key: CornerKey): number {
  const value = (node as unknown as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

/**
 * Sub-pixel de design nao ajuda ninguem e polui o diff entre dois exports.
 * 2 casas mantem meio-pixel de retina sem virar ruido.
 */
export function round(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}
