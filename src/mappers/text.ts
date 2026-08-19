import type { DiagnosticBag } from '../diagnostics'
import { RULES } from '../diagnostics'
import type { TokenCollector } from '../tokens'
import type { LetterSpacing, LineHeight, Text } from '../uiir'
import { rgbToHex } from './color'
import { round } from './geometry'

/** Propriedades que precisam ser uniformes para o node virar um unico TMP. */
const SEGMENT_FIELDS = [
  'fontName',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'fills',
  'textCase',
  'textDecoration',
] as const

type Segment = Pick<TextNode, (typeof SEGMENT_FIELDS)[number]> & {
  characters: string
}

export async function mapText(
  node: TextNode,
  bag: DiagnosticBag,
  tokens: TokenCollector,
  locKey: string | null,
): Promise<Text> {
  const segment = readPrimarySegment(node, bag)

  const font = readFont(segment.fontName)
  const size = typeof segment.fontSize === 'number' ? round(segment.fontSize) : 16
  const color = readColor(segment.fills)

  const text: Text = {
    characters: node.characters,
    font,
    size,
    alignHorizontal: node.textAlignHorizontal,
    alignVertical: node.textAlignVertical,
    color,
  }

  const lineHeight = mapLineHeight(segment.lineHeight)
  if (lineHeight !== undefined) text.lineHeight = lineHeight

  const letterSpacing = mapLetterSpacing(segment.letterSpacing)
  if (letterSpacing !== undefined) text.letterSpacing = letterSpacing

  const autoResize = mapAutoResize(node.textAutoResize)
  if (autoResize !== 'NONE') text.autoResize = autoResize

  if (typeof node.maxLines === 'number' && node.maxLines >= 1) text.maxLines = node.maxLines

  if (node.textTruncation === 'ENDING') text.truncation = 'ELLIPSIS'

  const textCase = mapTextCase(segment.textCase, node, bag)
  if (textCase !== 'ORIGINAL') text.case = textCase

  if (segment.textDecoration === 'UNDERLINE' || segment.textDecoration === 'STRIKETHROUGH') {
    text.decoration = segment.textDecoration
  }

  if (locKey !== null) text.locKey = locKey

  const styleId = node.textStyleId
  const token = await tokens.typographyToken(styleId, {
    family: font.family,
    style: font.style,
    size,
    ...(lineHeight !== undefined ? { lineHeight } : {}),
    ...(letterSpacing !== undefined ? { letterSpacing: letterSpacing.value } : {}),
  })

  if (token !== undefined) {
    text.token = token
  } else {
    bag.warn(
      RULES.hardcodedTypography,
      'Estilo de texto fora de token. Use um estilo da Library para o mapeamento de fonte na Unity ser previsivel.',
      node,
    )
  }

  return text
}

/**
 * Um TextNode do Figma pode ter formatacao por trecho; um TMP nao. Quando ha mais de um
 * trecho, o primeiro vale para o node inteiro e o designer e avisado — dividir em varios
 * TMP mudaria a hierarquia e quebraria a reconciliacao por id.
 */
function readPrimarySegment(node: TextNode, bag: DiagnosticBag): Segment {
  let segments: readonly Segment[] = []
  try {
    segments = node.getStyledTextSegments([...SEGMENT_FIELDS]) as unknown as readonly Segment[]
  } catch {
    segments = []
  }

  if (segments.length > 1) {
    bag.warn(
      RULES.mixedTextStyles,
      `Texto com ${segments.length} formatacoes diferentes; TextMeshPro usa uma. Valeu a do primeiro trecho — separe em layers se a diferenca importa.`,
      node,
    )
  }

  const first = segments[0]
  if (first !== undefined) return first

  // Texto vazio: getStyledTextSegments devolve lista vazia, entao lemos do node.
  return {
    characters: node.characters,
    fontName: node.fontName,
    fontSize: node.fontSize,
    lineHeight: node.lineHeight,
    letterSpacing: node.letterSpacing,
    fills: node.fills,
    textCase: node.textCase,
    textDecoration: node.textDecoration,
  } as Segment
}

function readFont(fontName: TextNode['fontName']): { family: string; style: string } {
  if (typeof fontName === 'object' && fontName !== null && 'family' in fontName) {
    return { family: fontName.family, style: fontName.style }
  }
  return { family: 'Inter', style: 'Regular' }
}

function readColor(fills: TextNode['fills']): string {
  if (!Array.isArray(fills)) return '#000000'
  const paint = fills.find((item) => item.visible !== false)
  if (paint === undefined || paint.type !== 'SOLID') return '#000000'
  return rgbToHex(paint.color, paint.opacity ?? 1)
}

function mapLineHeight(value: TextNode['lineHeight']): LineHeight | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  if (value.unit === 'AUTO') return { unit: 'AUTO' }
  if (value.unit === 'PIXELS' || value.unit === 'PERCENT') {
    return { unit: value.unit, value: round(value.value) }
  }
  return undefined
}

function mapLetterSpacing(value: TextNode['letterSpacing']): LetterSpacing | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  if (value.unit !== 'PIXELS' && value.unit !== 'PERCENT') return undefined
  if (value.value === 0) return undefined
  return { unit: value.unit, value: round(value.value) }
}

function mapAutoResize(value: TextNode['textAutoResize']): 'NONE' | 'HEIGHT' | 'WIDTH_AND_HEIGHT' {
  if (value === 'HEIGHT' || value === 'WIDTH_AND_HEIGHT') return value
  // TRUNCATE e legado e equivale a caixa fixa com corte.
  return 'NONE'
}

function mapTextCase(
  value: Segment['textCase'],
  node: TextNode,
  bag: DiagnosticBag,
): 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE' {
  if (value === 'UPPER' || value === 'LOWER' || value === 'TITLE') return value

  if (typeof value === 'string' && value.startsWith('SMALL_CAPS')) {
    bag.warn(
      RULES.unsupportedTextCase,
      'Small caps nao existe em TextMeshPro: exportado como maiuscula.',
      node,
    )
    return 'UPPER'
  }

  return 'ORIGINAL'
}
