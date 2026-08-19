/**
 * Mock minimo da API do Figma: o suficiente para traverse.ts rodar fora do Figma.
 *
 * Nao tenta imitar a API inteira — imita a superficie que o plugin realmente toca, que
 * e o que precisa continuar valendo quando o plugin mudar.
 */

interface BaseOverrides {
  id?: string
  name?: string
  width?: number
  height?: number
  x?: number
  y?: number
  visible?: boolean
  opacity?: number
  rotation?: number
  fills?: unknown
  strokes?: unknown
  strokeWeight?: number
  strokeAlign?: string
  fillStyleId?: string
  strokeStyleId?: string
  cornerRadius?: number
  effects?: unknown[]
  constraints?: { horizontal: string; vertical: string }
  clipsContent?: boolean
  children?: unknown[]
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL'
  layoutWrap?: 'NO_WRAP' | 'WRAP'
  itemSpacing?: number
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
  primaryAxisAlignItems?: 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN'
  counterAxisAlignItems?: 'MIN' | 'MAX' | 'CENTER' | 'BASELINE'
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL'
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL'
  layoutGrow?: number
}

let autoId = 0

function nextId(): string {
  autoId += 1
  return `1:${autoId}`
}

export function resetIds(): void {
  autoId = 0
}

export function solidPaint(r: number, g: number, b: number, opacity = 1): unknown {
  return { type: 'SOLID', visible: true, opacity, color: { r, g, b } }
}

export function gradientPaint(): unknown {
  return {
    type: 'GRADIENT_LINEAR',
    visible: true,
    opacity: 1,
    gradientStops: [
      { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
      { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
    ],
  }
}

export function imagePaint(scaleMode = 'FILL'): unknown {
  return { type: 'IMAGE', visible: true, opacity: 1, scaleMode, imageHash: 'abc' }
}

export function dropShadow(): unknown {
  return { type: 'DROP_SHADOW', visible: true, radius: 4, color: { r: 0, g: 0, b: 0, a: 0.25 } }
}

function base(type: string, overrides: BaseOverrides): Record<string, unknown> {
  const width = overrides.width ?? 100
  const height = overrides.height ?? 40
  const x = overrides.x ?? 0
  const y = overrides.y ?? 0

  return {
    type,
    id: overrides.id ?? nextId(),
    name: overrides.name ?? type,
    width,
    height,
    x,
    y,
    visible: overrides.visible ?? true,
    opacity: overrides.opacity ?? 1,
    rotation: overrides.rotation ?? 0,
    // O plugin calcula rect por diferenca de absoluteBoundingBox; os testes montam
    // arvores com coordenadas absolutas coerentes via `frame({ x, y })`.
    absoluteBoundingBox: { x, y, width, height },
    fills: overrides.fills ?? [],
    strokes: overrides.strokes ?? [],
    strokeWeight: overrides.strokeWeight ?? 0,
    strokeAlign: overrides.strokeAlign ?? 'INSIDE',
    fillStyleId: overrides.fillStyleId ?? '',
    strokeStyleId: overrides.strokeStyleId ?? '',
    cornerRadius: overrides.cornerRadius ?? 0,
    effects: overrides.effects ?? [],
    constraints: overrides.constraints ?? { horizontal: 'MIN', vertical: 'MIN' },
    layoutSizingHorizontal: overrides.layoutSizingHorizontal ?? 'FIXED',
    layoutSizingVertical: overrides.layoutSizingVertical ?? 'FIXED',
    layoutGrow: overrides.layoutGrow ?? 0,
    exportAsync: async () => new Uint8Array([137, 80, 78, 71]),
  }
}

/**
 * As coordenadas absolutas dos filhos sao recalculadas a partir do pai, imitando o que
 * o Figma faz — sem isso os rects relativos sairiam errados nos testes.
 */
function adoptChildren(parent: Record<string, unknown>, children: unknown[]): void {
  const parentBox = parent['absoluteBoundingBox'] as { x: number; y: number }

  for (const child of children) {
    const node = child as Record<string, unknown>
    const localX = node['x'] as number
    const localY = node['y'] as number
    const box = node['absoluteBoundingBox'] as { x: number; y: number; width: number; height: number }

    box.x = parentBox.x + localX
    box.y = parentBox.y + localY

    const grandChildren = node['children']
    if (Array.isArray(grandChildren)) adoptChildren(node, grandChildren)
  }
}

export function frame(overrides: BaseOverrides = {}): SceneNode {
  const children = overrides.children ?? []
  const node = {
    ...base('FRAME', overrides),
    clipsContent: overrides.clipsContent ?? false,
    children,
    layoutMode: overrides.layoutMode ?? 'NONE',
    layoutWrap: overrides.layoutWrap ?? 'NO_WRAP',
    itemSpacing: overrides.itemSpacing ?? 0,
    paddingTop: overrides.paddingTop ?? 0,
    paddingRight: overrides.paddingRight ?? 0,
    paddingBottom: overrides.paddingBottom ?? 0,
    paddingLeft: overrides.paddingLeft ?? 0,
    primaryAxisAlignItems: overrides.primaryAxisAlignItems ?? 'MIN',
    counterAxisAlignItems: overrides.counterAxisAlignItems ?? 'MIN',
    itemReverseZIndex: false,
  }

  adoptChildren(node, children)
  return node as unknown as SceneNode
}

export function group(overrides: BaseOverrides = {}): SceneNode {
  const children = overrides.children ?? []
  const node = { ...base('GROUP', overrides), children }
  adoptChildren(node, children)
  return node as unknown as SceneNode
}

export function rectangle(overrides: BaseOverrides = {}): SceneNode {
  return base('RECTANGLE', overrides) as unknown as SceneNode
}

export function vector(overrides: BaseOverrides = {}): SceneNode {
  return base('VECTOR', overrides) as unknown as SceneNode
}

interface TextOverrides extends BaseOverrides {
  characters?: string
  fontFamily?: string
  fontStyle?: string
  fontSize?: number
  lineHeight?: unknown
  letterSpacing?: unknown
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'
  textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM'
  textAutoResize?: 'NONE' | 'HEIGHT' | 'WIDTH_AND_HEIGHT'
  textTruncation?: 'DISABLED' | 'ENDING'
  maxLines?: number | null
  textCase?: string
  textDecoration?: string
  textStyleId?: string
  segments?: number
}

export function text(overrides: TextOverrides = {}): SceneNode {
  const characters = overrides.characters ?? 'Jogar'
  const fontName = { family: overrides.fontFamily ?? 'Nunito', style: overrides.fontStyle ?? 'Bold' }
  const fontSize = overrides.fontSize ?? 24
  const fills = overrides.fills ?? [solidPaint(1, 1, 1)]
  const lineHeight = overrides.lineHeight ?? { unit: 'PIXELS', value: 32 }
  const letterSpacing = overrides.letterSpacing ?? { unit: 'PIXELS', value: 0 }
  const textCase = overrides.textCase ?? 'ORIGINAL'
  const textDecoration = overrides.textDecoration ?? 'NONE'

  const segment = {
    characters,
    fontName,
    fontSize,
    lineHeight,
    letterSpacing,
    fills,
    textCase,
    textDecoration,
  }

  const segmentCount = overrides.segments ?? 1

  const node = {
    ...base('TEXT', { ...overrides, fills }),
    characters,
    fontName,
    fontSize,
    lineHeight,
    letterSpacing,
    textAlignHorizontal: overrides.textAlignHorizontal ?? 'CENTER',
    textAlignVertical: overrides.textAlignVertical ?? 'CENTER',
    textAutoResize: overrides.textAutoResize ?? 'NONE',
    textTruncation: overrides.textTruncation ?? 'DISABLED',
    maxLines: overrides.maxLines ?? null,
    textCase,
    textDecoration,
    textStyleId: overrides.textStyleId ?? '',
    getStyledTextSegments: () => Array.from({ length: segmentCount }, () => segment),
  }

  return node as unknown as SceneNode
}

interface InstanceOverrides extends BaseOverrides {
  /** Nome do ComponentSet quando ha variantes; senao, do proprio componente. */
  componentName?: string
  setName?: string | null
  key?: string
  properties?: Record<string, { value: unknown; type: string }>
  mainMissing?: boolean
}

export function instance(overrides: InstanceOverrides = {}): SceneNode {
  const componentName = overrides.componentName ?? 'Default'
  const setName = overrides.setName === undefined ? 'Button/Primary' : overrides.setName

  const set =
    setName === null
      ? null
      : { type: 'COMPONENT_SET', name: setName, key: overrides.key ?? 'setkey123', parent: null }

  const main = {
    type: 'COMPONENT',
    name: componentName,
    key: overrides.key ?? 'compkey123',
    parent: set,
  }

  const children = overrides.children ?? []
  const node = {
    ...base('INSTANCE', overrides),
    children,
    layoutMode: overrides.layoutMode ?? 'NONE',
    layoutWrap: 'NO_WRAP',
    itemSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    primaryAxisAlignItems: 'MIN',
    counterAxisAlignItems: 'MIN',
    componentProperties: overrides.properties ?? {},
    getMainComponentAsync: async () => (overrides.mainMissing === true ? null : main),
  }

  adoptChildren(node, children)
  return node as unknown as SceneNode
}

export interface FigmaGlobalOptions {
  fileName?: string
  pageName?: string
  fileKey?: string
  /** styleId -> nome do estilo, para o TokenCollector resolver. */
  styles?: Record<string, string>
}

export function installFigmaGlobal(options: FigmaGlobalOptions = {}): void {
  const styles = options.styles ?? {}

  const mock = {
    root: { name: options.fileName ?? 'Jogo Teste' },
    currentPage: { name: options.pageName ?? 'Telas', selection: [] },
    fileKey: options.fileKey ?? 'FILEKEY123',
    mixed: Symbol('figma.mixed'),
    getStyleByIdAsync: async (id: string) => {
      const name = styles[id]
      return name === undefined ? null : { id, name }
    },
  }

  ;(globalThis as unknown as { figma: unknown }).figma = mock
}
