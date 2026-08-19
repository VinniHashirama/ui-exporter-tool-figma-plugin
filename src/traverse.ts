import { DiagnosticBag, RULES } from './diagnostics'
import { looksLikeKitName } from './kit'
import type { PackedAsset } from './messages'
import {
  isDefaultLayerName,
  isValidBind,
  normalizeCanonicalName,
  parseName,
  parseScreenName,
  toAssetId,
} from './naming'
import { TokenCollector } from './tokens'
import type { Asset, Canvas, IRNode, NodeKind, Source, UIIR } from './uiir'
import { PLUGIN_VERSION, SCHEMA_VERSION } from './uiir'
import {
  hasGradientPaint,
  hasImagePaint,
  hasVisibleEffect,
  mapFill,
  mapStroke,
} from './mappers/fill'
import { mapComponent } from './mappers/component'
import { mapConstraints, mapCornerRadius, relativeRect, rootRect, round } from './mappers/geometry'
import { hasAutoLayout, mapLayout, mapLayoutChild } from './mappers/layout'
import { mapText } from './mappers/text'

export interface BuildOptions {
  /** false na varredura de selecao: monta o IR sem rasterizar PNG, que e a parte lenta. */
  exportAssets: boolean
  assetScale: 1 | 2 | 3 | 4
}

export interface BuildResult {
  ir: UIIR | null
  screenName: string | null
  assets: PackedAsset[]
  bag: DiagnosticBag
  nodeCount: number
  bindCount: number
  componentCount: number
}

/** Tipos que so podem ser representados como bitmap. */
const VECTOR_LIKE: ReadonlySet<string> = new Set([
  'VECTOR',
  'STAR',
  'POLYGON',
  'LINE',
  'ELLIPSE',
  'BOOLEAN_OPERATION',
])

/** Tipos que nao pertencem a uma tela de UI e sao descartados sem barulho. */
const NON_UI: ReadonlySet<string> = new Set([
  'SLICE',
  'CONNECTOR',
  'STICKY',
  'SHAPE_WITH_TEXT',
  'CODE_BLOCK',
  'WIDGET',
  'EMBED',
  'LINK_UNFURL',
  'MEDIA',
  'SECTION',
  'TABLE',
  'TABLE_CELL',
  'STAMP',
  'HIGHLIGHT',
  'WASHI_TAPE',
])

interface Ctx {
  bag: DiagnosticBag
  tokens: TokenCollector
  assets: Asset[]
  packed: PackedAsset[]
  binds: Map<string, string>
  opts: BuildOptions
  counts: { nodes: number; components: number }
}

export async function build(
  selection: readonly SceneNode[],
  opts: BuildOptions,
): Promise<BuildResult> {
  const bag = new DiagnosticBag()
  const ctx: Ctx = {
    bag,
    tokens: new TokenCollector(),
    assets: [],
    packed: [],
    binds: new Map(),
    opts,
    counts: { nodes: 0, components: 0 },
  }

  const empty = (screenName: string | null = null): BuildResult => ({
    ir: null,
    screenName,
    assets: [],
    bag,
    nodeCount: 0,
    bindCount: 0,
    componentCount: 0,
  })

  if (selection.length === 0) {
    bag.error(RULES.emptySelection, 'Selecione o frame da tela (aquele chamado "screen/...").')
    return empty()
  }
  if (selection.length > 1) {
    bag.error(
      RULES.emptySelection,
      `${selection.length} objetos selecionados. Exporte um frame de tela por vez.`,
    )
    return empty()
  }

  const root = selection[0]!

  if (root.type !== 'FRAME' && root.type !== 'COMPONENT') {
    bag.error(
      RULES.rootFrameName,
      `A selecao e do tipo ${root.type}. A raiz da tela precisa ser um Frame.`,
      root,
    )
    return empty()
  }

  const screenName = parseScreenName(root.name)
  if (screenName === null) {
    bag.error(
      RULES.rootFrameName,
      `Frame raiz "${root.name}" fora do padrao. Renomeie para "screen/NomeDaTela" (PascalCase, sem espaco).`,
      root,
    )
    return empty()
  }

  if (!('children' in root) || root.children.length === 0) {
    bag.warn(RULES.emptyScreen, 'A tela nao tem nenhuma layer dentro.', root)
  }

  const irRoot = await visit(root, null, ctx, { parentHasLayout: false, isRoot: true })
  if (irRoot === null) {
    bag.error(RULES.emptySelection, 'A tela ficou vazia depois de aplicar as convencoes.')
    return empty(screenName)
  }

  const canvas: Canvas = {
    width: round(root.width),
    height: round(root.height),
    orientation: root.width > root.height ? 'landscape' : 'portrait',
  }

  const ir: UIIR = {
    schemaVersion: SCHEMA_VERSION,
    source: readSource(),
    canvas,
    assets: ctx.assets,
    lint: bag.sorted(),
    root: irRoot,
  }

  const tokens = ctx.tokens.build()
  if (tokens !== undefined) ir.tokens = tokens

  return {
    ir,
    screenName,
    assets: ctx.packed,
    bag,
    nodeCount: ctx.counts.nodes,
    bindCount: ctx.binds.size,
    componentCount: ctx.counts.components,
  }
}

interface VisitOptions {
  parentHasLayout: boolean
  isRoot: boolean
}

async function visit(
  node: SceneNode,
  parent: BaseNode | null,
  ctx: Ctx,
  { parentHasLayout, isRoot }: VisitOptions,
): Promise<IRNode | null> {
  if (NON_UI.has(node.type)) return null

  const parsed = parseName(node.name)
  if (parsed.ignored) return null

  // A raiz usa o nome da tela; o resto usa o nome limpo das convencoes.
  const name = isRoot ? (parseScreenName(node.name) ?? parsed.clean) : parsed.clean

  const kind = classify(node, parsed.flatten)
  if (kind === null) return null

  reportNodeIssues(node, kind, parsed.flatten, isRoot, ctx)

  const irNode: IRNode = {
    id: node.id,
    name,
    kind,
    rect: isRoot ? rootRect(node) : relativeRect(node, parent),
  }

  if ('rotation' in node && Math.abs(node.rotation) > 0.01) {
    irNode.rotation = round(node.rotation)
  }
  if ('opacity' in node && node.opacity < 1) {
    irNode.opacity = round(node.opacity)
  }
  if (node.visible === false) {
    irNode.visible = false
  }
  if ('clipsContent' in node && node.clipsContent) {
    irNode.clip = true
  }

  // Constraints so valem quando ninguem esta posicionando o node por layout.
  if (!parentHasLayout && !isRoot) {
    const constraints = mapConstraints(node)
    if (constraints !== undefined) irNode.constraints = constraints
  }
  if (parentHasLayout) {
    irNode.layoutChild = mapLayoutChild(node)
  }

  applyBind(node, parsed.bind, irNode, ctx)

  switch (kind) {
    case 'text': {
      irNode.text = await mapText(node as TextNode, ctx.bag, ctx.tokens, parsed.locKey)
      break
    }

    case 'instance': {
      const component = await mapComponent(node as InstanceNode, ctx.bag)
      if (component !== undefined) {
        irNode.component = component
        ctx.counts.components += 1
      } else {
        // Sem componente resolvido nao ha prefab para instanciar: degrada para frame
        // para o node ao menos existir na hierarquia.
        irNode.kind = 'frame'
        await applySurface(node, irNode, ctx)
        await appendChildren(node, irNode, ctx)
      }
      break
    }

    case 'image': {
      const assetId = await registerAsset(node, name, ctx)
      if (assetId !== null) {
        irNode.fill = { type: 'IMAGE', assetId, scaleMode: readScaleMode(node, parsed.flatten) }
      } else {
        irNode.kind = 'frame'
      }
      break
    }

    case 'frame':
    case 'group': {
      await applySurface(node, irNode, ctx)
      await appendChildren(node, irNode, ctx)
      break
    }
  }

  ctx.counts.nodes += 1
  return irNode
}

/** Fundo, contorno, cantos e layout — tudo o que faz um container ser um container. */
async function applySurface(node: SceneNode, irNode: IRNode, ctx: Ctx): Promise<void> {
  const layout = mapLayout(node, ctx.bag)
  if (layout !== undefined) irNode.layout = layout

  const fill = await mapFill(node, ctx.bag, ctx.tokens)
  if (fill !== undefined) irNode.fill = fill

  const stroke = await mapStroke(node, ctx.tokens)
  if (stroke !== undefined) irNode.stroke = stroke

  const corners = mapCornerRadius(node)
  if (corners !== undefined) irNode.cornerRadius = corners
}

async function appendChildren(node: SceneNode, irNode: IRNode, ctx: Ctx): Promise<void> {
  if (!('children' in node)) return

  const parentHasLayout = hasAutoLayout(node)
  const children: IRNode[] = []

  // A ordem de children no Figma vai de tras para frente, igual a ordem de irmaos em
  // UGUI: indice 0 e o fundo nos dois. Nada a inverter.
  for (const child of node.children) {
    const built = await visit(child, node, ctx, { parentHasLayout, isRoot: false })
    if (built !== null) children.push(built)
  }

  if (children.length > 0) irNode.children = children
}

function classify(node: SceneNode, flatten: boolean): NodeKind | null {
  if (node.type === 'TEXT') return 'text'
  if (node.type === 'INSTANCE') return 'instance'
  if (flatten || VECTOR_LIKE.has(node.type) || hasImagePaint(node)) return 'image'
  if (node.type === 'GROUP') return 'group'
  if (
    node.type === 'FRAME' ||
    node.type === 'COMPONENT' ||
    node.type === 'COMPONENT_SET' ||
    node.type === 'RECTANGLE'
  ) {
    return 'frame'
  }
  return null
}

function reportNodeIssues(
  node: SceneNode,
  kind: NodeKind,
  flatten: boolean,
  isRoot: boolean,
  ctx: Ctx,
): void {
  const { bag } = ctx

  if (isDefaultLayerName(node.name)) {
    bag.warn(
      RULES.defaultLayerName,
      `"${node.name}" e nome automatico do Figma. Na Unity vira um GameObject com esse nome.`,
      node,
    )
  }

  if ('rotation' in node && Math.abs(node.rotation) > 0.01) {
    bag.warn(
      RULES.rotatedNode,
      'Node rotacionado tem suporte limitado: a posicao vem da caixa alinhada aos eixos. Achate com "#img" se a rotacao importa.',
      node,
    )
  }

  if (!flatten && kind !== 'image') {
    if (hasVisibleEffect(node)) {
      bag.warn(
        RULES.unsupportedEffect,
        'Sombra, blur ou blend mode nao sao reconstruidos e serao perdidos. Marque a layer com "#img".',
        node,
      )
    }
    if (hasGradientPaint(node)) {
      // O detalhe da aproximacao sai em mapFill; aqui so garantimos o aviso quando o
      // gradiente esta num node cujo fill nao chega a ser lido.
      bag.warn(
        RULES.unsupportedEffect,
        'Gradiente nao e reconstruido. Marque a layer com "#img".',
        node,
      )
    }
  }

  if (!flatten && VECTOR_LIKE.has(node.type)) {
    bag.warn(
      RULES.complexVector,
      `${node.type} foi rasterizado automaticamente. Marque com "#img" para deixar a intencao explicita.`,
      node,
    )
  }

  // Frame com nome de componente do kit costuma ser instancia descolada ou improviso
  // com retangulo — nos dois casos, na Unity vira caixa sem comportamento.
  //
  // A checagem usa o nome CRU, nao o limpo: sanitizeName remove a barra, e sem ela
  // "Button/Primary" viraria "ButtonPrimary" e escaparia da deteccao.
  //
  // A raiz fica de fora: `screen/Algo` normaliza para `Screen/Algo`, e `Screen` e um
  // componente do kit — sem essa excecao toda tela valida acusaria falso positivo.
  if (!isRoot && node.type !== 'INSTANCE' && kind !== 'text') {
    const canonical = normalizeCanonicalName(node.name)
    if (canonical !== null && looksLikeKitName(canonical)) {
      bag.warn(
        RULES.detachedInstance,
        `"${node.name}" tem nome de componente do kit mas nao e uma instancia. Use a instancia da Library para herdar comportamento.`,
        node,
      )
    }
  }
}

function applyBind(node: SceneNode, bind: string | null, irNode: IRNode, ctx: Ctx): void {
  if (bind === null) return

  if (!isValidBind(bind)) {
    ctx.bag.error(
      RULES.invalidBind,
      `"@${bind}" nao e um identificador valido. Use letras, digitos e underscore, comecando por letra.`,
      node,
    )
    return
  }

  const existing = ctx.binds.get(bind)
  if (existing !== undefined) {
    ctx.bag.error(
      RULES.duplicateBind,
      `"@${bind}" aparece mais de uma vez. Cada bind precisa ser unico na tela.`,
      node,
    )
    return
  }

  ctx.binds.set(bind, node.id)
  irNode.bind = bind
}

async function registerAsset(node: SceneNode, name: string, ctx: Ctx): Promise<string | null> {
  const { assetScale, exportAssets } = ctx.opts

  if (node.width <= 0 || node.height <= 0) {
    ctx.bag.warn(
      RULES.complexVector,
      'Layer sem area nao pode ser rasterizada e foi exportada como container vazio.',
      node,
    )
    return null
  }

  const id = toAssetId(name, node.id)
  const file = `images/${id}@${assetScale}x.png`

  if (exportAssets) {
    try {
      const bytes = await node.exportAsync({
        format: 'PNG',
        constraint: { type: 'SCALE', value: assetScale },
      })
      ctx.packed.push({ path: file, bytes })
    } catch (error) {
      ctx.bag.warn(
        RULES.complexVector,
        `Nao foi possivel rasterizar esta layer (${describeError(error)}).`,
        node,
      )
      return null
    }
  }

  const asset: Asset = {
    id,
    file,
    scale: assetScale,
    width: Math.max(1, Math.round(node.width * assetScale)),
    height: Math.max(1, Math.round(node.height * assetScale)),
  }
  ctx.assets.push(asset)

  return id
}

function readScaleMode(node: SceneNode, flatten: boolean): 'FILL' | 'FIT' | 'STRETCH' | 'TILE' {
  // Node achatado por "#img" ou por ser vetor gera um PNG do tamanho exato da caixa:
  // esticar e o unico modo que preserva o desenho.
  if (flatten || !hasImagePaint(node)) return 'STRETCH'

  if ('fills' in node && Array.isArray(node.fills)) {
    const paint = [...node.fills].reverse().find((item) => item.visible !== false)
    if (paint?.type === 'IMAGE') {
      switch (paint.scaleMode) {
        case 'FILL':
        case 'CROP':
          return 'FILL'
        case 'FIT':
          return 'FIT'
        case 'TILE':
          return 'TILE'
        default:
          return 'FIT'
      }
    }
  }
  return 'FIT'
}

function readSource(): Source {
  let fileKey = 'local'
  try {
    // fileKey pode nao estar disponivel dependendo do contexto de execucao.
    const key = figma.fileKey
    if (typeof key === 'string' && key.length > 0) fileKey = key
  } catch {
    fileKey = 'local'
  }

  // Sem identidade de autor de proposito: o pacote nao carrega PII.
  return {
    fileKey,
    fileName: figma.root.name,
    pageName: figma.currentPage.name,
    exportedAt: new Date().toISOString(),
    pluginVersion: PLUGIN_VERSION,
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
