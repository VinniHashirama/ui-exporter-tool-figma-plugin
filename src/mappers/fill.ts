import type { DiagnosticBag } from '../diagnostics'
import { RULES } from '../diagnostics'
import type { TokenCollector } from '../tokens'
import type { Fill, Stroke } from '../uiir'
import { rgbToHex } from './color'
import { round } from './geometry'

export function hasImagePaint(node: SceneNode): boolean {
  if (!('fills' in node)) return false
  const fills = node.fills
  if (!Array.isArray(fills)) return false
  return fills.some(
    (paint) => paint.visible !== false && (paint.type === 'IMAGE' || paint.type === 'VIDEO'),
  )
}

export function hasVisibleEffect(node: SceneNode): boolean {
  if (!('effects' in node)) return false
  const effects = node.effects
  if (!Array.isArray(effects)) return false
  return effects.some((effect) => effect.visible !== false)
}

export function hasGradientPaint(node: SceneNode): boolean {
  if (!('fills' in node)) return false
  const fills = node.fills
  if (!Array.isArray(fills)) return false
  return fills.some((paint) => paint.visible !== false && paint.type.startsWith('GRADIENT_'))
}

export async function mapFill(
  node: SceneNode,
  bag: DiagnosticBag,
  tokens: TokenCollector,
): Promise<Fill | undefined> {
  if (!('fills' in node)) return undefined

  const fills = node.fills
  if (!Array.isArray(fills)) {
    bag.warn(RULES.mixedFills, 'Node com fills mistos: nenhum fundo foi exportado.', node)
    return undefined
  }

  const visible = fills.filter((paint) => paint.visible !== false)
  if (visible.length === 0) return undefined

  if (visible.length > 1) {
    bag.warn(
      RULES.multipleFills,
      `${visible.length} fills empilhados; UGUI suporta um. Apenas o de cima foi exportado — achate em PNG com "#img" se a pilha importa.`,
      node,
    )
  }

  // A array de fills do Figma vai de baixo para cima: o ultimo elemento renderiza no
  // topo. Se o piloto mostrar cor invertida em node com fill empilhado, e aqui.
  const paint = visible[visible.length - 1]!

  if (paint.type === 'SOLID') {
    const color = rgbToHex(paint.color, paint.opacity ?? 1)
    const fill: Fill = { type: 'SOLID', color }

    const styleId = 'fillStyleId' in node ? node.fillStyleId : undefined
    const token = await tokens.colorToken(styleId, color)
    if (token !== undefined) {
      fill.token = token
    } else {
      bag.warn(
        RULES.hardcodedColor,
        'Cor fora de token. Use um estilo de cor da Library para a paleta do jogo poder mudar sem editar cada layer.',
        node,
      )
    }
    return fill
  }

  if (paint.type.startsWith('GRADIENT_')) {
    // Aproximacao deliberada: sem "#img" o gradiente vira o primeiro stop, e o designer
    // e avisado. Melhor uma cor chapada previsivel do que um fundo faltando.
    const stops = 'gradientStops' in paint ? paint.gradientStops : undefined
    const first = stops?.[0]
    const color = first !== undefined ? rgbToHex(first.color, first.color.a) : '#00000000'
    bag.warn(
      RULES.unsupportedEffect,
      `Gradiente nao e reconstruido: virou a cor chapada ${color}. Marque a layer com "#img" para sair fiel ao desenho.`,
      node,
    )
    return { type: 'SOLID', color }
  }

  // IMAGE / VIDEO chegam aqui apenas se o traverse nao achatou o node — nesse caso o
  // fundo nao tem como ser representado.
  bag.warn(
    RULES.unsupportedEffect,
    `Fill do tipo ${paint.type} nao e suportado. Marque a layer com "#img".`,
    node,
  )
  return undefined
}

export async function mapStroke(
  node: SceneNode,
  tokens: TokenCollector,
): Promise<Stroke | undefined> {
  if (!('strokes' in node)) return undefined

  const strokes = node.strokes
  if (!Array.isArray(strokes)) return undefined

  const paint = strokes.find((item) => item.visible !== false)
  if (paint === undefined || paint.type !== 'SOLID') return undefined

  const weight = readStrokeWeight(node)
  if (weight <= 0) return undefined

  const color = rgbToHex(paint.color, paint.opacity ?? 1)
  const stroke: Stroke = { color, weight: round(weight) }

  if ('strokeAlign' in node) stroke.align = node.strokeAlign

  const styleId = 'strokeStyleId' in node ? node.strokeStyleId : undefined
  const token = await tokens.colorToken(styleId, color)
  if (token !== undefined) stroke.token = token

  return stroke
}

function readStrokeWeight(node: SceneNode): number {
  if (!('strokeWeight' in node)) return 0

  const weight = node.strokeWeight
  if (typeof weight === 'number') return weight

  // figma.mixed: espessura por lado. UGUI nao tem contorno por lado, entao o lado de
  // cima serve de representante.
  const top = (node as unknown as Record<string, unknown>)['strokeTopWeight']
  return typeof top === 'number' ? top : 0
}
