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
 * Deriva as bordas de 9-slice a partir do raio dos cantos e da espessura do traco.
 *
 * A area que nao pode esticar num fundo arredondado e exatamente o canto: esticar dentro
 * dele achata a curva, que e a distorcao que o 9-slice existe para evitar. Traco conta
 * junto porque a linha desenhada na borda tambem deforma ao esticar.
 *
 * **Cantos nao sao arestas.** `cornerRadius` e `[TL, TR, BR, BL]` e `nineSlice` e
 * `[top, right, bottom, left]`: cada aresta encosta em dois cantos e recebe o maior dos
 * dois. Copiar elemento a elemento so erra com raios assimetricos, o que faria o bug passar
 * por qualquer teste escrito com raio uniforme.
 *
 * O clamp nao e detalhe: a Unity exige `left + right <= largura`. Um botao em formato de
 * pilula tem raio igual a metade da altura, entao sem limitar as bordas o sprite sai
 * degenerado — e esse e o formato de botao mais comum que existe.
 */
export function deriveNineSlice(
  node: SceneNode,
): [number, number, number, number] | undefined {
  const corners = mapCornerRadius(node)
  if (corners === undefined) return undefined

  const [topLeft, topRight, bottomRight, bottomLeft] = corners
  const stroke = strokeInset(node)

  const edges: [number, number, number, number] = [
    Math.max(topLeft, topRight) + stroke,
    Math.max(topRight, bottomRight) + stroke,
    Math.max(bottomRight, bottomLeft) + stroke,
    Math.max(bottomLeft, topLeft) + stroke,
  ]

  return clampNineSlice(edges, node.width, node.height)
}

/**
 * Limita as bordas para caberem no sprite, deixando ao menos 1px de area esticavel por eixo.
 */
export function clampNineSlice(
  edges: [number, number, number, number],
  width: number,
  height: number,
): [number, number, number, number] | undefined {
  const maxHorizontal = Math.max(0, Math.floor(width / 2) - 1)
  const maxVertical = Math.max(0, Math.floor(height / 2) - 1)

  const clamped: [number, number, number, number] = [
    clamp(edges[0], maxVertical),
    clamp(edges[1], maxHorizontal),
    clamp(edges[2], maxVertical),
    clamp(edges[3], maxHorizontal),
  ]

  return clamped.some((value) => value > 0) ? clamped : undefined
}

/** True quando o clamp teve que encolher alguma aresta — o export avisa nesse caso. */
export function wasClamped(
  edges: [number, number, number, number],
  clamped: [number, number, number, number],
): boolean {
  return edges.some((value, index) => Math.floor(value) > clamped[index]!)
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(Math.floor(value), max))
}

function strokeInset(node: SceneNode): number {
  if (!('strokes' in node) || !Array.isArray(node.strokes) || node.strokes.length === 0) {
    return 0
  }

  const weight = (node as unknown as { strokeWeight?: unknown }).strokeWeight
  return typeof weight === 'number' && Number.isFinite(weight) ? Math.max(0, weight) : 0
}

/**
 * Sub-pixel de design nao ajuda ninguem e polui o diff entre dois exports.
 * 2 casas mantem meio-pixel de retina sem virar ruido.
 */
export function round(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}
