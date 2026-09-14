/**
 * Cria a biblioteca canônica dentro do Figma.
 *
 * Existe pelo mesmo motivo que o gerador de prefabs da Unity: se os dois lados do contrato
 * são gerados por código, os nomes canônicos casam por construção. Deixar o designer montar
 * 15 componentes na mão a partir de um doc é onde nascem os erros de caixa e de grafia que
 * depois aparecem como `unknown-component` no import — e que só são descobertos na Unity,
 * longe de quem pode corrigir.
 *
 * As cores são os mesmos valores do kit placeholder da Unity, então os dois lados nascem
 * parecidos e a comparação visual do piloto tem alguma chance de significar algo.
 */

import { KIT_CATALOG } from './kit'
import type { CustomRole } from './kit'
import { normalizeCanonicalName } from './naming'

const PAGE_NAME = 'UI Kit'

const FONT_FAMILY = 'Inter'

/** Ordem de preferência: o Figma nomeia os pesos do Inter de forma diferente por versão. */
const REGULAR_CANDIDATES = ['Regular', 'Medium']
const MEDIUM_CANDIDATES = ['Medium', 'Regular']
const SEMIBOLD_CANDIDATES = ['Semi Bold', 'SemiBold', 'Medium', 'Bold']
const BOLD_CANDIDATES = ['Bold', 'Semi Bold', 'Medium']

/** Mesmos valores do UIKitFactory da Unity. */
const PALETTE = {
  background: { r: 0.07, g: 0.08, b: 0.12 },
  surface: { r: 0.16, g: 0.17, b: 0.22 },
  'surface-raised': { r: 0.22, g: 0.23, b: 0.29 },
  primary: { r: 0.05, g: 0.6, b: 1 },
  'primary-muted': { r: 0.3, g: 0.33, b: 0.4 },
  text: { r: 0.95, g: 0.96, b: 0.98 },
  'text-muted': { r: 0.62, g: 0.65, b: 0.72 },
  track: { r: 0.12, g: 0.13, b: 0.17 },
} as const

type PaletteKey = keyof typeof PALETTE

export interface KitResult {
  pageName: string
  created: string[]
  skipped: string[]
  stylesCreated: number
  warnings: string[]
}

/** Nome do frame de exemplo que o designer duplica para começar uma tela. */
export const SCREEN_TEMPLATE_NAME = 'screen/Exemplo'

type Builder = (ctx: Ctx) => Promise<ComponentNode | ComponentSetNode>

/**
 * Como construir cada nome canônico do catálogo.
 *
 * O agrupamento e a ordem vivem em `KIT_CATALOG` (`kit.ts`), que a UI do plugin também lê.
 * Aqui fica só o "como": assim a lista que o designer vê e o que o botão cria são a mesma
 * fonte, e `kit.test.ts` cobra que todo nome do catálogo tenha um construtor.
 */
export const KIT_BUILDERS: Readonly<Record<string, Builder>> = {
  Panel: buildPanel,
  'Window/Modal': buildWindow,
  ScrollView: buildScrollView,
  'Button/Primary': (ctx) => buildTextButton(ctx, 'primary'),
  'Button/Secondary': (ctx) => buildTextButton(ctx, 'primary-muted'),
  'Button/Icon': buildIconButton,
  'Toggle/Checkbox': buildCheckbox,
  Slider: buildSlider,
  InputField: buildInputField,
  Label: buildLabel,
  Icon: buildIcon,
  Image: buildImage,
  ProgressBar: buildProgressBar,
  Tabs: buildTabs,
}

/** Nomes canônicos que este gerador cria. Testado contra o kit v1 do contrato. */
export const KIT_COMPONENT_NAMES: readonly string[] = KIT_CATALOG.flatMap(
  (section) => [...section.items],
)

interface Fonts {
  regular: FontName
  medium: FontName
  semibold: FontName
  bold: FontName
}

interface Ctx {
  page: PageNode
  fonts: Fonts
  colors: Map<PaletteKey, PaintStyle>
  texts: Map<string, TextStyle>
  result: KitResult
}

/**
 * Cria os componentes do kit na página `UI Kit`.
 *
 * @param only
 * Nomes canônicos a criar. Omitido, cria o kit inteiro mais os tokens e o template de tela —
 * o caminho de quem está começando um arquivo. Informado, cria só o que foi pedido, que é o
 * caminho de quem já tem o kit e quer um componente a mais sem mexer no resto.
 */
export async function createKit(only?: readonly string[]): Promise<KitResult> {
  const wanted = only === undefined ? null : new Set(only)
  const fullKit = wanted === null

  const result: KitResult = {
    pageName: PAGE_NAME,
    created: [],
    skipped: [],
    stylesCreated: 0,
    warnings: [],
  }

  if (wanted !== null) {
    for (const name of wanted) {
      if (KIT_BUILDERS[name] === undefined) {
        result.warnings.push(`'${name}' não está no kit; não há como criá-lo.`)
      }
    }
  }

  const fonts = await loadFonts(result)
  const page = await findOrCreatePage(PAGE_NAME)

  const ctx: Ctx = {
    page,
    fonts,
    colors: new Map(),
    texts: new Map(),
    result,
  }

  await ensureColorStyles(ctx)
  await ensureTextStyles(ctx)

  const existing = collectExistingNames(page)

  // Cursor de layout simples: seções empilhadas, componentes em linhas que quebram.
  const MAX_ROW_WIDTH = 1500
  const GAP = 64

  // Começa abaixo do que já está na página. Sem isto, criar um componente avulso num
  // arquivo que já tem o kit o colocaria em cima do que existe.
  const layout = { x: 0, y: bottomOf(page, GAP), rowHeight: 0 }

  const place = (node: SceneNode): void => {
    if (layout.x > 0 && layout.x + node.width > MAX_ROW_WIDTH) {
      layout.x = 0
      layout.y += layout.rowHeight + GAP
      layout.rowHeight = 0
    }
    node.x = layout.x
    node.y = layout.y
    layout.x += node.width + GAP
    layout.rowHeight = Math.max(layout.rowHeight, node.height)
  }

  const section = async (title: string): Promise<void> => {
    if (layout.x > 0 || layout.rowHeight > 0) {
      layout.y += layout.rowHeight + GAP * 2
    }
    layout.x = 0
    layout.rowHeight = 0

    const heading = figma.createText()
    heading.fontName = ctx.fonts.bold
    heading.characters = title
    heading.fontSize = 48
    heading.fills = [solid(PALETTE['text-muted'])]
    heading.x = 0
    heading.y = layout.y
    page.appendChild(heading)

    layout.y += heading.height + GAP
  }

  if (fullKit) {
    await section('Tokens')
    placeSwatches(ctx, place)
  }

  const built: SceneNode[] = []

  for (const group of KIT_CATALOG) {
    const items = group.items.filter((name) => wanted === null || wanted.has(name))
    if (items.length === 0) {
      continue
    }

    // Só o kit inteiro ganha títulos de seção: criar avulso repetidamente encheria a página
    // de cabeçalhos duplicados.
    if (fullKit) {
      await section(group.title)
    }

    for (const name of items) {
      if (existing.has(name)) {
        result.skipped.push(name)
        continue
      }

      const build = KIT_BUILDERS[name]
      if (build === undefined) {
        continue
      }

      const node = await build(ctx)
      node.name = name
      page.appendChild(node)
      place(node)
      built.push(node)
      existing.add(name)
      result.created.push(name)
    }
  }

  if (fullKit) {
    await buildScreenTemplate(ctx, existing)
  }

  await figma.setCurrentPageAsync(page)

  // Enquadra o que acabou de ser criado; sem nada novo, o começo da página.
  const focus = built.length > 0 ? built : page.children.length > 0 ? [page.children[0]!] : []
  if (focus.length > 0) {
    figma.viewport.scrollAndZoomIntoView(focus)
  }

  if (built.length > 0) {
    figma.currentPage.selection = built
  }

  return result
}

/**
 * Cria um componente que não está no kit canônico.
 *
 * O kit cobre o vocabulário compartilhado; isto cobre o resto — o `ItemSlot` de um jogo, o
 * `Card` de outro. O componente nasce já com as layers de slot nomeadas (`$label`,
 * `$icon`...), porque é por elas que o exportador descobre onde o importador deve escrever
 * conteúdo. Montado à mão, sem essa nomenclatura, o componente até exporta, mas chega na
 * Unity como uma casca que ninguém consegue preencher.
 */
export async function createCustomComponent(
  rawName: string,
  role: CustomRole,
): Promise<KitResult> {
  const result: KitResult = {
    pageName: PAGE_NAME,
    created: [],
    skipped: [],
    stylesCreated: 0,
    warnings: [],
  }

  const name = normalizeCanonicalName(rawName)

  if (name === null) {
    result.warnings.push(
      `'${rawName}' não vira um nome canônico válido. Use letras e números, com '/' para ` +
        'agrupar — por exemplo "HUD/StatBar".',
    )
    return result
  }

  if (name !== rawName.trim()) {
    result.warnings.push(`Normalizei o nome para '${name}'.`)
  }

  const fonts = await loadFonts(result)
  const page = await findOrCreatePage(PAGE_NAME)

  const ctx: Ctx = { page, fonts, colors: new Map(), texts: new Map(), result }

  await ensureColorStyles(ctx)
  await ensureTextStyles(ctx)

  if (collectExistingNames(page).has(name)) {
    result.skipped.push(name)
    return result
  }

  const node = await buildCustom(ctx, name, role)
  node.name = name
  page.appendChild(node)

  node.x = 0
  node.y = bottomOf(page, 64)

  result.created.push(name)

  await figma.setCurrentPageAsync(page)
  figma.viewport.scrollAndZoomIntoView([node])
  figma.currentPage.selection = [node]

  return result
}

/**
 * Esqueleto inicial por papel.
 *
 * Deliberadamente simples: o designer vai redesenhar isto. O que precisa estar certo desde o
 * começo é a estrutura que o pipeline lê — os nomes de slot e o Auto Layout —, não a
 * aparência, que é justamente o que ele vai trocar.
 */
async function buildCustom(
  ctx: Ctx,
  name: string,
  role: CustomRole,
): Promise<ComponentNode> {
  const leaf = name.split('/').pop() ?? name

  switch (role) {
    case 'button': {
      const node = component(name, 320, 96)
      row(node, 12, 32, 20)
      node.cornerRadius = 20
      node.layoutSizingHorizontal = 'HUG'
      await surface(ctx, node, 'primary')

      const iconLeft = rect('$iconLeft', 40, 40, PALETTE.text, 8)
      iconLeft.visible = false
      node.appendChild(iconLeft)

      const label = await text(ctx, '$label', leaf, { style: 'text/button' })
      node.appendChild(label)

      const iconRight = rect('$iconRight', 40, 40, PALETTE.text, 8)
      iconRight.visible = false
      node.appendChild(iconRight)

      const labelProperty = addProperty(node, 'label', 'TEXT', leaf, ctx.result)
      if (labelProperty !== null) {
        bindProperty(label, 'characters', labelProperty, ctx.result, 'label')
      }

      return node
    }

    case 'toggle': {
      const node = component(name, 360, 64)
      row(node, 16, 0, 0)
      node.layoutSizingHorizontal = 'HUG'
      node.fills = []

      const box = rect('Box', 48, 48, PALETTE['surface-raised'], 10)
      node.appendChild(box)

      const check = rect('$checkmark', 28, 28, PALETTE.primary, 6)
      node.appendChild(check)

      const label = await text(ctx, '$label', leaf, { style: 'text/body', align: 'LEFT' })
      node.appendChild(label)

      return node
    }

    case 'container': {
      const node = component(name, 600, 400)
      column(node, 16, 32, 32)
      node.cornerRadius = 24
      await surface(ctx, node, 'surface')

      const content = figma.createFrame()
      content.name = '$content'
      content.resizeWithoutConstraints(536, 336)
      content.fills = []
      node.appendChild(content)

      return node
    }

    case 'display': {
      const node = component(name, 320, 48)
      row(node, 8, 0, 0)
      node.layoutSizingHorizontal = 'HUG'
      node.fills = []

      const label = await text(ctx, '$label', leaf, { style: 'text/body', align: 'LEFT' })
      node.appendChild(label)

      return node
    }

    case 'icon': {
      const node = component(name, 64, 64)
      node.fills = []

      const glyph = rect('$icon', 64, 64, PALETTE['text-muted'], 8)
      node.appendChild(glyph)

      return node
    }

    case 'image': {
      const node = component(name, 240, 180)
      node.fills = []

      const art = rect('$image', 240, 180, PALETTE['surface-raised'], 12)
      node.appendChild(art)

      return node
    }
  }
}

/** Borda inferior do conteúdo já existente na página, com folga. Página vazia devolve 0. */
function bottomOf(page: PageNode, gap: number): number {
  let bottom: number | null = null

  for (const child of page.children) {
    const edge = child.y + child.height
    if (bottom === null || edge > bottom) {
      bottom = edge
    }
  }

  return bottom === null ? 0 : bottom + gap * 2
}

// ----------------------------------------------------------------- infraestrutura

async function loadFonts(result: KitResult): Promise<Fonts> {
  const regular = await resolveFont(REGULAR_CANDIDATES, result)
  const medium = await resolveFont(MEDIUM_CANDIDATES, result)
  const semibold = await resolveFont(SEMIBOLD_CANDIDATES, result)
  const bold = await resolveFont(BOLD_CANDIDATES, result)

  return { regular, medium, semibold, bold }
}

/**
 * Tenta os pesos em ordem e devolve o primeiro que carrega. Os nomes dos pesos do Inter
 * mudam entre versões do Figma ("Semi Bold" x "SemiBold"), e um kit que falha inteiro por
 * causa de um peste ausente não serve.
 */
async function resolveFont(candidates: string[], result: KitResult): Promise<FontName> {
  for (const style of candidates) {
    const font: FontName = { family: FONT_FAMILY, style }
    try {
      await figma.loadFontAsync(font)
      return font
    } catch {
      // Tenta o próximo.
    }
  }

  result.warnings.push(
    `Nenhum destes pesos do ${FONT_FAMILY} está disponível: ${candidates.join(', ')}. ` +
      'Usei o peso padrão.',
  )

  const fallback: FontName = { family: FONT_FAMILY, style: 'Regular' }
  await figma.loadFontAsync(fallback)
  return fallback
}

async function findOrCreatePage(name: string): Promise<PageNode> {
  for (const page of figma.root.children) {
    if (page.name === name) {
      await page.loadAsync()
      return page
    }
  }

  const page = figma.createPage()
  page.name = name
  return page
}

function collectExistingNames(page: PageNode): Set<string> {
  const names = new Set<string>()

  for (const node of page.children) {
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'FRAME') {
      names.add(node.name)
    }
  }

  return names
}

async function ensureColorStyles(ctx: Ctx): Promise<void> {
  const existing = new Map<string, PaintStyle>()

  for (const style of await figma.getLocalPaintStylesAsync()) {
    existing.set(style.name, style)
  }

  for (const key of Object.keys(PALETTE) as PaletteKey[]) {
    const name = `color/${key}`
    let style = existing.get(name)

    if (style === undefined) {
      style = figma.createPaintStyle()
      style.name = name
      ctx.result.stylesCreated++
    }

    style.paints = [solid(PALETTE[key])]
    ctx.colors.set(key, style)
  }
}

const TEXT_STYLES = [
  { name: 'text/h1', weight: 'bold', size: 56, lineHeight: 64 },
  { name: 'text/h2', weight: 'semibold', size: 40, lineHeight: 48 },
  { name: 'text/button', weight: 'semibold', size: 32, lineHeight: 40 },
  { name: 'text/body', weight: 'regular', size: 28, lineHeight: 36 },
  { name: 'text/caption', weight: 'regular', size: 20, lineHeight: 28 },
] as const

async function ensureTextStyles(ctx: Ctx): Promise<void> {
  const existing = new Map<string, TextStyle>()

  for (const style of await figma.getLocalTextStylesAsync()) {
    existing.set(style.name, style)
  }

  for (const spec of TEXT_STYLES) {
    let style = existing.get(spec.name)

    if (style === undefined) {
      style = figma.createTextStyle()
      style.name = spec.name
      ctx.result.stylesCreated++
    }

    style.fontName = ctx.fonts[spec.weight]
    style.fontSize = spec.size
    style.lineHeight = { unit: 'PIXELS', value: spec.lineHeight }

    ctx.texts.set(spec.name, style)
  }
}

function solid(color: RGB): SolidPaint {
  return { type: 'SOLID', color, opacity: 1 }
}

/**
 * Aplicar estilo por id precisa das variantes async quando o manifest usa
 * documentAccess: dynamic-page. A versão sync ainda funciona em muitos casos, então
 * tentamos a async e caímos para ela — sem estilo o kit continua utilizável, só perde o
 * vínculo de token.
 */
async function applyFillStyle(
  node: SceneNode & MinimalFillsMixin,
  style: PaintStyle,
  result: KitResult,
): Promise<void> {
  try {
    await node.setFillStyleIdAsync(style.id)
    return
  } catch {
    // Cai para a versão sync abaixo.
  }

  try {
    ;(node as unknown as { fillStyleId: string }).fillStyleId = style.id
  } catch {
    // O fill literal já foi aplicado, então a cor sai certa — o que se perde é o vínculo
    // com o token, e com ele o aviso `hardcoded-color` no primeiro export. Silenciar isso
    // faria o designer caçar na Unity a causa de algo que nasceu aqui.
    result.warnings.push(
      `Não consegui vincular '${node.name}' ao estilo de cor '${style.name}'. A cor está ` +
        'certa, mas sem token: o export vai avisar `hardcoded-color` nessa layer.',
    )
  }
}

async function applyTextStyle(
  node: TextNode,
  style: TextStyle,
  result: KitResult,
): Promise<void> {
  try {
    await node.setTextStyleIdAsync(style.id)
    return
  } catch {
    // Cai para a versão sync abaixo.
  }

  try {
    ;(node as unknown as { textStyleId: string }).textStyleId = style.id
  } catch {
    result.warnings.push(
      `Não consegui vincular '${node.name}' ao estilo de texto '${style.name}'. As métricas ` +
        'estão certas, mas sem token: o export vai avisar `hardcoded-typography` nessa layer.',
    )
  }
}

// ------------------------------------------------------------------ construtores

interface TextOptions {
  weight?: keyof Fonts
  size?: number
  color?: PaletteKey
  style?: string
  align?: 'LEFT' | 'CENTER' | 'RIGHT'
}

async function text(ctx: Ctx, name: string, content: string, options: TextOptions = {}): Promise<TextNode> {
  const node = figma.createText()
  node.name = name
  node.fontName = ctx.fonts[options.weight ?? 'regular']
  node.characters = content
  node.fontSize = options.size ?? 28
  node.textAlignHorizontal = options.align ?? 'CENTER'
  node.textAlignVertical = 'CENTER'
  node.fills = [solid(PALETTE[options.color ?? 'text'])]

  const styleName = options.style
  if (styleName !== undefined) {
    const style = ctx.texts.get(styleName)
    if (style !== undefined) {
      await applyTextStyle(node, style, ctx.result)
    }
  }

  return node
}

async function surface(
  ctx: Ctx,
  node: SceneNode & MinimalFillsMixin,
  color: PaletteKey,
): Promise<void> {
  node.fills = [solid(PALETTE[color])]

  const style = ctx.colors.get(color)
  if (style !== undefined) {
    await applyFillStyle(node, style, ctx.result)
  }
}

function component(name: string, width: number, height: number): ComponentNode {
  const node = figma.createComponent()
  node.name = name
  node.resizeWithoutConstraints(width, height)
  return node
}

function row(
  node: FrameNode | ComponentNode,
  spacing: number,
  paddingX: number,
  paddingY: number,
): void {
  node.layoutMode = 'HORIZONTAL'
  node.itemSpacing = spacing
  node.paddingLeft = paddingX
  node.paddingRight = paddingX
  node.paddingTop = paddingY
  node.paddingBottom = paddingY
  node.primaryAxisAlignItems = 'CENTER'
  node.counterAxisAlignItems = 'CENTER'
}

function column(
  node: FrameNode | ComponentNode,
  spacing: number,
  paddingX: number,
  paddingY: number,
): void {
  node.layoutMode = 'VERTICAL'
  node.itemSpacing = spacing
  node.paddingLeft = paddingX
  node.paddingRight = paddingX
  node.paddingTop = paddingY
  node.paddingBottom = paddingY
  node.primaryAxisAlignItems = 'MIN'
  node.counterAxisAlignItems = 'MIN'
}

function rect(name: string, width: number, height: number, color: RGB, radius = 0): RectangleNode {
  const node = figma.createRectangle()
  node.name = name
  node.resizeWithoutConstraints(width, height)
  node.fills = [solid(color)]
  node.cornerRadius = radius
  return node
}

/**
 * Liga um nó a uma propriedade de componente, de forma best-effort.
 *
 * Se falhar, o export continua funcionando: o plugin deriva o `label` do primeiro texto
 * descendente quando não há propriedade declarada. Vale avisar, não vale abortar o kit.
 */
function bindProperty(
  node: SceneNode,
  key: 'characters' | 'visible',
  propertyId: string,
  result: KitResult,
  label: string,
): void {
  try {
    node.componentPropertyReferences = { [key]: propertyId }
  } catch {
    result.warnings.push(
      `Não consegui ligar a propriedade '${label}'. O export continua funcionando pelo texto ` +
        'interno do componente.',
    )
  }
}

function addProperty(
  target: ComponentNode | ComponentSetNode,
  name: string,
  type: 'TEXT' | 'BOOLEAN',
  defaultValue: string | boolean,
  result: KitResult,
): string | null {
  try {
    return target.addComponentProperty(name, type, defaultValue)
  } catch {
    result.warnings.push(`Não consegui criar a propriedade '${name}' em '${target.name}'.`)
    return null
  }
}

// --------------------------------------------------------------------- containers

async function buildPanel(ctx: Ctx): Promise<ComponentNode> {
  const node = component('Panel', 600, 400)
  column(node, 16, 32, 32)
  node.cornerRadius = 24
  await surface(ctx, node, 'surface')

  const hint = await text(ctx, 'Conteúdo', 'Conteúdo do painel', {
    style: 'text/body',
    color: 'text-muted',
    align: 'LEFT',
  })
  node.appendChild(hint)

  return node
}

async function buildWindow(ctx: Ctx): Promise<ComponentNode> {
  const node = component('Window/Modal', 800, 560)
  column(node, 0, 0, 0)
  node.cornerRadius = 32
  node.clipsContent = true
  await surface(ctx, node, 'surface')

  const header = figma.createFrame()
  header.name = 'Header'
  header.resizeWithoutConstraints(800, 96)
  row(header, 16, 32, 20)
  await surface(ctx, header, 'surface-raised')
  node.appendChild(header)
  header.layoutSizingHorizontal = 'FILL'

  const title = await text(ctx, 'Title', 'Título da janela', {
    style: 'text/h2',
    align: 'LEFT',
  })
  header.appendChild(title)
  title.layoutSizingHorizontal = 'FILL'

  const close = figma.createFrame()
  close.name = 'Close'
  close.resizeWithoutConstraints(56, 56)
  row(close, 0, 0, 0)
  close.cornerRadius = 28
  await surface(ctx, close, 'primary-muted')
  header.appendChild(close)

  const closeGlyph = await text(ctx, 'Glyph', '✕', { weight: 'semibold', size: 28 })
  close.appendChild(closeGlyph)

  const body = figma.createFrame()
  body.name = 'Body'
  body.resizeWithoutConstraints(800, 320)
  column(body, 16, 32, 32)
  body.fills = []
  node.appendChild(body)
  body.layoutSizingHorizontal = 'FILL'

  const bodyHint = await text(ctx, 'Conteúdo', 'Corpo da janela', {
    style: 'text/body',
    color: 'text-muted',
    align: 'LEFT',
  })
  body.appendChild(bodyHint)

  const footer = figma.createFrame()
  footer.name = 'Footer'
  footer.resizeWithoutConstraints(800, 112)
  row(footer, 16, 32, 24)
  footer.primaryAxisAlignItems = 'MAX'
  footer.fills = []
  node.appendChild(footer)
  footer.layoutSizingHorizontal = 'FILL'

  const titleProperty = addProperty(node, 'title', 'TEXT', 'Título da janela', ctx.result)
  if (titleProperty !== null) {
    bindProperty(title, 'characters', titleProperty, ctx.result, 'title')
  }

  return node
}

async function buildScrollView(ctx: Ctx): Promise<ComponentNode> {
  const node = component('ScrollView', 600, 700)
  column(node, 0, 0, 0)
  node.cornerRadius = 24
  node.clipsContent = true
  await surface(ctx, node, 'track')

  const content = figma.createFrame()
  content.name = 'Content'
  content.resizeWithoutConstraints(600, 700)
  column(content, 16, 24, 24)
  content.fills = []
  node.appendChild(content)
  content.layoutSizingHorizontal = 'FILL'

  for (let i = 1; i <= 3; i++) {
    const item = figma.createFrame()
    item.name = `Item ${i}`
    item.resizeWithoutConstraints(552, 96)
    row(item, 12, 24, 24)
    item.cornerRadius = 16
    await surface(ctx, item, 'surface')
    content.appendChild(item)
    item.layoutSizingHorizontal = 'FILL'

    const itemLabel = await text(ctx, 'Label', `Item ${i}`, {
      style: 'text/body',
      align: 'LEFT',
    })
    item.appendChild(itemLabel)
    itemLabel.layoutSizingHorizontal = 'FILL'
  }

  return node
}

// -------------------------------------------------------------------------- ações

const BUTTON_STATES = ['Default', 'Hover', 'Pressed', 'Disabled'] as const

async function buildTextButton(ctx: Ctx, color: PaletteKey): Promise<ComponentSetNode> {
  const variants: ComponentNode[] = []
  const labels: TextNode[] = []
  const iconsLeft: SceneNode[] = []
  const iconsRight: SceneNode[] = []

  for (const state of BUTTON_STATES) {
    const variant = component(`State=${state}`, 320, 96)
    row(variant, 12, 32, 20)
    variant.cornerRadius = 20
    variant.layoutSizingHorizontal = 'HUG'
    await surface(ctx, variant, state === 'Disabled' ? 'primary-muted' : color)
    variant.opacity = state === 'Disabled' ? 0.5 : 1

    const iconLeft = rect('IconLeft', 40, 40, PALETTE.text, 8)
    iconLeft.visible = false
    variant.appendChild(iconLeft)
    iconsLeft.push(iconLeft)

    const label = await text(ctx, 'Label', 'Botão', { style: 'text/button' })
    variant.appendChild(label)
    labels.push(label)

    const iconRight = rect('IconRight', 40, 40, PALETTE.text, 8)
    iconRight.visible = false
    variant.appendChild(iconRight)
    iconsRight.push(iconRight)

    variants.push(variant)
  }

  const set = figma.combineAsVariants(variants, ctx.page)

  const labelProperty = addProperty(set, 'label', 'TEXT', 'Botão', ctx.result)
  if (labelProperty !== null) {
    for (const label of labels) {
      bindProperty(label, 'characters', labelProperty, ctx.result, 'label')
    }
  }

  const leftProperty = addProperty(set, 'iconLeft', 'BOOLEAN', false, ctx.result)
  if (leftProperty !== null) {
    for (const icon of iconsLeft) {
      bindProperty(icon, 'visible', leftProperty, ctx.result, 'iconLeft')
    }
  }

  const rightProperty = addProperty(set, 'iconRight', 'BOOLEAN', false, ctx.result)
  if (rightProperty !== null) {
    for (const icon of iconsRight) {
      bindProperty(icon, 'visible', rightProperty, ctx.result, 'iconRight')
    }
  }

  return set
}

async function buildIconButton(ctx: Ctx): Promise<ComponentSetNode> {
  const variants: ComponentNode[] = []

  for (const state of BUTTON_STATES) {
    const variant = component(`State=${state}`, 96, 96)
    row(variant, 0, 20, 20)
    variant.cornerRadius = 20
    await surface(ctx, variant, 'primary-muted')
    variant.opacity = state === 'Disabled' ? 0.5 : 1

    const icon = rect('Icon', 56, 56, PALETTE.text, 8)
    variant.appendChild(icon)

    variants.push(variant)
  }

  return figma.combineAsVariants(variants, ctx.page)
}

// ------------------------------------------------------------------------ entrada

async function buildCheckbox(ctx: Ctx): Promise<ComponentSetNode> {
  const variants: ComponentNode[] = []
  const labels: TextNode[] = []

  for (const checked of ['On', 'Off'] as const) {
    const variant = component(`Checked=${checked}`, 360, 56)
    row(variant, 16, 0, 0)
    variant.primaryAxisAlignItems = 'MIN'
    variant.layoutSizingHorizontal = 'HUG'
    variant.fills = []

    const box = figma.createFrame()
    box.name = 'Box'
    box.resizeWithoutConstraints(48, 48)
    row(box, 0, 8, 8)
    box.cornerRadius = 12
    await surface(ctx, box, 'track')
    variant.appendChild(box)

    const checkmark = rect('Checkmark', 28, 28, PALETTE.primary, 6)
    checkmark.visible = checked === 'On'
    box.appendChild(checkmark)

    const label = await text(ctx, 'Label', 'Opção', { style: 'text/body', align: 'LEFT' })
    variant.appendChild(label)
    labels.push(label)

    variants.push(variant)
  }

  const set = figma.combineAsVariants(variants, ctx.page)

  const labelProperty = addProperty(set, 'label', 'TEXT', 'Opção', ctx.result)
  if (labelProperty !== null) {
    for (const label of labels) {
      bindProperty(label, 'characters', labelProperty, ctx.result, 'label')
    }
  }

  return set
}

async function buildSlider(ctx: Ctx): Promise<ComponentNode> {
  const node = component('Slider', 400, 48)
  node.fills = []

  const track = rect('Background', 400, 12, PALETTE.track, 6)
  track.y = 18
  node.appendChild(track)
  await surface(ctx, track, 'track')

  const fill = rect('Fill', 200, 12, PALETTE.primary, 6)
  fill.y = 18
  node.appendChild(fill)
  await surface(ctx, fill, 'primary')

  const handle = figma.createEllipse()
  handle.name = 'Handle'
  handle.resizeWithoutConstraints(44, 44)
  handle.x = 178
  handle.y = 2
  handle.fills = [solid(PALETTE.text)]
  node.appendChild(handle)

  return node
}

async function buildInputField(ctx: Ctx): Promise<ComponentNode> {
  const node = component('InputField', 480, 80)
  row(node, 0, 24, 20)
  node.primaryAxisAlignItems = 'MIN'
  node.cornerRadius = 16
  await surface(ctx, node, 'track')

  const placeholder = await text(ctx, 'Placeholder', 'Digite aqui...', {
    style: 'text/body',
    color: 'text-muted',
    align: 'LEFT',
  })
  node.appendChild(placeholder)
  placeholder.layoutSizingHorizontal = 'FILL'

  return node
}

// ----------------------------------------------------------------------- exibição

async function buildLabel(ctx: Ctx): Promise<ComponentNode> {
  const node = component('Label', 320, 40)
  row(node, 0, 0, 0)
  node.layoutSizingHorizontal = 'HUG'
  node.layoutSizingVertical = 'HUG'
  node.fills = []

  const label = await text(ctx, 'Text', 'Texto', { style: 'text/body', align: 'LEFT' })
  node.appendChild(label)

  const property = addProperty(node, 'text', 'TEXT', 'Texto', ctx.result)
  if (property !== null) {
    bindProperty(label, 'characters', property, ctx.result, 'text')
  }

  return node
}

async function buildIcon(ctx: Ctx): Promise<ComponentNode> {
  const node = component('Icon', 64, 64)
  node.fills = []

  const glyph = rect('Glyph', 64, 64, PALETTE.text, 12)
  node.appendChild(glyph)
  await surface(ctx, glyph, 'text')

  return node
}

async function buildImage(ctx: Ctx): Promise<ComponentNode> {
  const node = component('Image', 240, 180)
  node.fills = []

  const placeholder = rect('Placeholder', 240, 180, PALETTE['surface-raised'], 12)
  node.appendChild(placeholder)

  const hint = await text(ctx, 'Hint', 'imagem', {
    style: 'text/caption',
    color: 'text-muted',
  })
  hint.x = 90
  hint.y = 78
  node.appendChild(hint)

  return node
}

async function buildProgressBar(ctx: Ctx): Promise<ComponentNode> {
  const node = component('ProgressBar', 400, 32)
  node.fills = []

  const track = rect('Background', 400, 32, PALETTE.track, 16)
  node.appendChild(track)
  await surface(ctx, track, 'track')

  const fill = rect('Fill', 240, 32, PALETTE.primary, 16)
  node.appendChild(fill)
  await surface(ctx, fill, 'primary')

  return node
}

// ---------------------------------------------------------------------- navegação

async function buildTabs(ctx: Ctx): Promise<ComponentNode> {
  const node = component('Tabs', 600, 72)
  row(node, 8, 0, 0)
  node.fills = []

  for (let i = 0; i < 2; i++) {
    const tab = figma.createFrame()
    tab.name = `Tab${i + 1}`
    tab.resizeWithoutConstraints(296, 72)
    row(tab, 0, 24, 16)
    tab.cornerRadius = 16
    await surface(ctx, tab, i === 0 ? 'primary' : 'primary-muted')
    node.appendChild(tab)
    tab.layoutSizingHorizontal = 'FILL'

    const label = await text(ctx, 'Label', `Aba ${i + 1}`, { style: 'text/body' })
    tab.appendChild(label)
  }

  return node
}

// ------------------------------------------------------------- template e swatches

/**
 * O `Screen` do kit da Unity é o prefab de Canvas para teste isolado; no Figma o
 * equivalente não é um componente, é a convenção de nome do frame. Então em vez de um
 * componente `Screen`, o kit entrega um frame de exemplo já nomeado corretamente, com a
 * SafeArea dentro — que é o que o designer duplica para começar uma tela.
 */
async function buildScreenTemplate(ctx: Ctx, existing: Set<string>): Promise<void> {
  const name = SCREEN_TEMPLATE_NAME

  if (existing.has(name)) {
    ctx.result.skipped.push(name)
    return
  }

  const screen = figma.createFrame()
  screen.name = name
  screen.resizeWithoutConstraints(1080, 1920)
  await surface(ctx, screen, 'background')
  screen.clipsContent = true

  // Longe da coluna de componentes, para não abrir um vão gigante no layout da página.
  screen.x = 1700
  screen.y = 0
  ctx.page.appendChild(screen)

  const safeArea = figma.createFrame()
  safeArea.name = 'SafeArea'
  safeArea.resizeWithoutConstraints(1080, 1760)
  safeArea.x = 0
  safeArea.y = 80
  safeArea.fills = []
  safeArea.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' }
  screen.appendChild(safeArea)

  const hint = await text(
    ctx,
    '_instrucoes',
    'Duplique este frame e renomeie para screen/NomeDaTela.\n' +
      'Layers com _ na frente são ignoradas no export.',
    { style: 'text/body', color: 'text-muted', align: 'LEFT' },
  )
  hint.x = 64
  hint.y = 160
  hint.resizeWithoutConstraints(952, 100)
  safeArea.appendChild(hint)

  ctx.result.created.push(name)
}

function placeSwatches(ctx: Ctx, place: (node: SceneNode) => void): void {
  const group = figma.createFrame()
  group.name = '_tokens de cor'
  group.layoutMode = 'HORIZONTAL'
  group.itemSpacing = 16
  group.paddingLeft = 0
  group.paddingRight = 0
  group.paddingTop = 0
  group.paddingBottom = 0
  group.fills = []
  group.resizeWithoutConstraints(1200, 120)

  for (const key of Object.keys(PALETTE) as PaletteKey[]) {
    const swatch = rect(`color/${key}`, 120, 120, PALETTE[key], 16)
    group.appendChild(swatch)
  }

  group.layoutSizingHorizontal = 'HUG'
  group.layoutSizingVertical = 'HUG'

  ctx.page.appendChild(group)
  place(group)
}
