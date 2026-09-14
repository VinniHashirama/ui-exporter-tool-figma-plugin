/**
 * Tipos do UIIR. Espelho de schema/uiir.schema.json.
 *
 * Em caso de divergencia, o SCHEMA manda: ele e validado no CI contra a saida real
 * do plugin (tests/schema.test.ts). Mudou aqui, mude la, e vice-versa.
 */

/**
 * 1.1.0: bloco `kit` opcional, para o pacote de componente. Campo novo e opcional e MINOR
 * pela regra do contrato — um importador 1.0 le o pacote de tela normalmente.
 */
export const SCHEMA_VERSION = '1.1.0'
export const PLUGIN_VERSION = '0.1.0'

export type Color = string
export type AssetId = string
export type TokenRef = string

/** [top, right, bottom, left] */
export type Edges = [number, number, number, number]
/** [topLeft, topRight, bottomRight, bottomLeft] */
export type Corners = [number, number, number, number]

export type Severity = 'error' | 'warning' | 'info'

export interface Diagnostic {
  severity: Severity
  rule: string
  message: string
  nodeId?: string
  nodeName?: string
}

export interface Source {
  fileKey: string
  fileName: string
  pageName?: string
  exportedAt: string
  pluginVersion: string
}

export interface Canvas {
  width: number
  height: number
  orientation?: 'portrait' | 'landscape'
}

export interface TypographyToken {
  family: string
  style: string
  size: number
  lineHeight?: LineHeight
  letterSpacing?: number
}

export interface Tokens {
  colors?: Record<string, Color>
  typography?: Record<string, TypographyToken>
  spacing?: Record<string, number>
}

export interface Asset {
  id: AssetId
  file: string
  scale: 1 | 2 | 3 | 4
  width: number
  height: number
  nineSlice?: Edges
}

export type NodeKind = 'frame' | 'group' | 'text' | 'image' | 'instance'

export type ConstraintMode = 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'SCALE'

export interface Constraints {
  horizontal: ConstraintMode
  vertical: ConstraintMode
}

export type SizingMode = 'FIXED' | 'HUG' | 'FILL'

export interface Sizing {
  horizontal: SizingMode
  vertical: SizingMode
}

export interface Layout {
  mode: 'HORIZONTAL' | 'VERTICAL' | 'WRAP'
  padding: Edges
  spacing: number
  primaryAlign: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'
  counterAlign: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE'
  sizing: Sizing
  reverseZIndex?: boolean
}

export interface LayoutChild {
  sizing: Sizing
  grow?: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Fill {
  type: 'SOLID' | 'IMAGE'
  color?: Color
  assetId?: AssetId
  scaleMode?: 'FILL' | 'FIT' | 'STRETCH' | 'TILE'
  token?: TokenRef
}

export interface Stroke {
  color: Color
  weight: number
  align?: 'INSIDE' | 'OUTSIDE' | 'CENTER'
  token?: TokenRef
}

export type LineHeight =
  | { unit: 'PIXELS' | 'PERCENT'; value: number }
  | { unit: 'AUTO' }

export interface LetterSpacing {
  unit: 'PIXELS' | 'PERCENT'
  value: number
}

export interface Text {
  characters: string
  font: { family: string; style: string }
  size: number
  lineHeight?: LineHeight
  letterSpacing?: LetterSpacing
  alignHorizontal: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'
  alignVertical: 'TOP' | 'CENTER' | 'BOTTOM'
  autoResize?: 'NONE' | 'HEIGHT' | 'WIDTH_AND_HEIGHT'
  color: Color
  maxLines?: number
  truncation?: 'DISABLED' | 'ELLIPSIS'
  case?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE'
  decoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH'
  token?: TokenRef
  locKey?: string | null
}

export interface ComponentRef {
  setKey?: string
  canonicalName: string
  properties?: Record<string, string | number | boolean | null>
}

export interface IRNode {
  id: string
  name: string
  kind: NodeKind
  component?: ComponentRef
  rect: Rect
  rotation?: number
  opacity?: number
  visible?: boolean
  clip?: boolean
  constraints?: Constraints
  layout?: Layout
  layoutChild?: LayoutChild
  fill?: Fill
  stroke?: Stroke
  cornerRadius?: Corners
  text?: Text
  bind?: string
  children?: IRNode[]
}

/** Papel do componente: o que o Figma nao consegue expressar sobre comportamento. */
export type KitRole = 'button' | 'toggle' | 'container' | 'display' | 'icon' | 'image'

/**
 * Ponto de injecao que o componente expoe ao importador.
 *
 * O `nodeId` e o que liga o slot ao objeto de verdade dentro do prefab. Casar por nome seria
 * fragil: o designer renomeia layer o tempo todo, e o id sobrevive a isso.
 */
export interface KitSlot {
  name: string
  nodeId: string
}

/**
 * Cabecalho do pacote de componente.
 *
 * Presente apenas em `kit.json`; um pacote de tela nao tem este bloco. E o que diz ao
 * importador que ele deve gerar um prefab de kit em vez de uma tela.
 */
export interface Kit {
  canonicalName: string
  role: KitRole
  /**
   * Variante do ComponentSet de onde este export saiu.
   *
   * Travar isso importa: cada variante tem ids de node proprios, entao exportar de uma
   * variante diferente depois trocaria TODOS os ids de uma vez, e o importador recriaria o
   * prefab inteiro — perdendo o que o dev tivesse pendurado nele.
   */
  sourceVariantId?: string
  /** Nomes das variantes que existem no Figma mas nao vieram neste pacote. */
  ignoredVariants?: string[]
  slots: KitSlot[]
}

export interface UIIR {
  schemaVersion: string
  source: Source
  canvas: Canvas
  kit?: Kit
  tokens?: Tokens
  assets: Asset[]
  lint: Diagnostic[]
  root: IRNode
}
