import { DiagnosticBag, RULES } from './diagnostics'
import { looksLikeKitName } from './kit'
import type { PackedAsset } from './messages'
import type { NineSlice } from './naming'
import {
  isDefaultLayerName,
  isValidBind,
  normalizeCanonicalName,
  parseName,
  parseScreenName,
  toAssetId,
  toKitAssetId,
} from './naming'
import { TokenCollector } from './tokens'
import type {
  Asset,
  Canvas,
  Component,
  IRNode,
  KitRole,
  KitSlot,
  NodeKind,
  Source,
  UIIR,
} from './uiir'
import { PLUGIN_VERSION, SCHEMA_VERSION } from './uiir'
import {
  hasGradientPaint,
  hasImagePaint,
  hasVisibleEffect,
  mapFill,
  mapStroke,
} from './mappers/fill'
import { mapComponent } from './mappers/component'
import {
  clampNineSlice,
  deriveNineSlice,
  mapConstraints,
  mapCornerRadius,
  relativeRect,
  rootRect,
  round,
  wasClamped,
} from './mappers/geometry'
import { hasAutoLayout, mapLayout, mapLayoutChild } from './mappers/layout'
import { mapText } from './mappers/text'

export interface BuildOptions {
  /** false na varredura de selecao: monta o IR sem rasterizar PNG, que e a parte lenta. */
  exportAssets: boolean
  assetScale: 1 | 2 | 3 | 4
  /**
   * Deriva bordas de 9-slice do raio dos cantos quando a layer nao tem anotacao `#9s`.
   *
   * Ligado so no export de componente. Numa tela, `#img` marca ilustracao e logo — arte que
   * NAO deve esticar em fatias, e que fatiada sairia deformada. Num componente, o `#img` e
   * a pele do botao, exatamente o caso em que a borda tem que ser preservada. Por isso a
   * derivacao e por modo de export, e nao global: a anotacao explicita continua valendo nos
   * dois.
   */
  deriveSlices?: boolean
  /** Papel escolhido pelo designer no export de componente. Ausente, e inferido pelo nome. */
  role?: KitRole
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

export interface ComponentBuildResult {
  ir: UIIR | null
  canonicalName: string | null
  assets: PackedAsset[]
  bag: DiagnosticBag
  nodeCount: number
  slotCount: number
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
  /**
   * Nome canonico quando o export e de componente. Muda a politica de nome de asset: numa
   * tela o id carrega o node id para garantir unicidade na reconciliacao; num componente o
   * artista vai abrir esses arquivos, entao eles seguem a spec de entrega de arte.
   */
  kitName: string | null
  takenAssetIds: Set<string>
}

/**
 * Monta o IR de um componente do kit a partir da selecao.
 *
 * Reusa `visit()` inteiro: travessia, mappers, tokens e assets sao os mesmos de uma tela. O
 * que muda e so a entrada — a raiz e um COMPONENT em vez de um frame `screen/` — e o
 * cabecalho `component`, que diz ao importador para gerar um prefab em vez de uma tela.
 */
export async function buildComponent(
  selection: readonly SceneNode[],
  opts: BuildOptions,
): Promise<ComponentBuildResult> {
  const bag = new DiagnosticBag()
  const ctx: Ctx = {
    bag,
    tokens: new TokenCollector(),
    assets: [],
    packed: [],
    binds: new Map(),
    opts,
    counts: { nodes: 0, components: 0 },
    // Preenchido assim que o nome canônico é validado, antes de qualquer asset ser
    // registrado.
    kitName: null,
    takenAssetIds: new Set(),
  }

  const empty = (canonicalName: string | null = null): ComponentBuildResult => ({
    ir: null,
    canonicalName,
    assets: [],
    bag,
    nodeCount: 0,
    slotCount: 0,
  })

  if (selection.length === 0) {
    bag.error(
      RULES.emptySelection,
      'Selecione o componente que voce quer exportar (um Component ou um Component Set).',
    )
    return empty()
  }
  if (selection.length > 1) {
    bag.error(
      RULES.emptySelection,
      `${selection.length} objetos selecionados. Exporte um componente por vez.`,
    )
    return empty()
  }

  const selected = selection[0]!

  if (selected.type !== 'COMPONENT' && selected.type !== 'COMPONENT_SET') {
    bag.error(
      RULES.componentRoot,
      `A selecao e do tipo ${selected.type}. Para exportar como componente do kit, ela precisa ` +
        'ser um Component (ou um Component Set, se tiver variantes). Selecione a layer e use ' +
        '"Create component" no Figma.',
      selected,
    )
    return empty()
  }

  // Com variantes, o nome canonico vem do SET: cada variante se chama `State=Default`, e usar
  // isso daria um nome diferente por combinacao de variante.
  const rawName = selected.name
  const canonicalName = normalizeCanonicalName(rawName)

  if (canonicalName === null) {
    bag.error(
      RULES.componentRoot,
      `O nome "${rawName}" nao vira um nome canonico valido. Use letras e numeros, com "/" ` +
        'para agrupar — por exemplo "Button/Primary".',
      selected,
    )
    return empty()
  }

  ctx.kitName = canonicalName

  const { source, ignoredVariants } = pickSourceVariant(selected, bag)

  if (source === null) {
    bag.error(
      RULES.componentRoot,
      'O Component Set nao tem nenhuma variante utilizavel.',
      selected,
    )
    return empty(canonicalName)
  }

  const irRoot = await visit(source, null, ctx, { parentHasLayout: false, isRoot: true })

  if (irRoot === null) {
    bag.error(RULES.componentRoot, 'O componente ficou vazio depois de aplicar as convencoes.')
    return empty(canonicalName)
  }

  // A raiz do componente carrega o nome canonico, nao o nome da variante.
  irRoot.name = canonicalName.split('/').join('_')

  const slots = collectSlots(source, ctx)

  const component: Component = {
    canonicalName,
    role: inferRole(canonicalName, opts.role),
    slots,
  }

  if (selected.type === 'COMPONENT_SET') component.sourceVariantId = source.id
  if (ignoredVariants.length > 0) component.ignoredVariants = ignoredVariants

  const ir: UIIR = {
    schemaVersion: SCHEMA_VERSION,
    source: readSource(),
    canvas: {
      width: round(source.width),
      height: round(source.height),
    },
    component,
    assets: ctx.assets,
    lint: bag.sorted(),
    root: irRoot,
  }

  const tokens = ctx.tokens.build()
  if (tokens !== undefined) ir.tokens = tokens

  return {
    ir,
    canonicalName,
    assets: ctx.packed,
    bag,
    nodeCount: ctx.counts.nodes,
    slotCount: slots.length,
  }
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
    // Export de tela: o id do asset continua carregando o node id, que é o que garante
    // unicidade para a reconciliação.
    kitName: null,
    takenAssetIds: new Set(),
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

/**
 * Escolhe de qual variante o componente e exportado.
 *
 * So o estado default sai no MVP: os demais vem do prefab do kit, via ColorTint. Exportar as
 * quatro variantes como irmas produziria quatro fundos empilhados no mesmo prefab.
 */
function pickSourceVariant(
  selected: ComponentNode | ComponentSetNode,
  bag: DiagnosticBag,
): { source: SceneNode | null; ignoredVariants: string[] } {
  if (selected.type === 'COMPONENT') {
    return { source: selected, ignoredVariants: [] }
  }

  const variants = selected.children.filter(
    (child): child is ComponentNode => child.type === 'COMPONENT',
  )

  if (variants.length === 0) return { source: null, ignoredVariants: [] }

  const isDefault = (variant: ComponentNode): boolean =>
    /(^|,\s*)State\s*=\s*(Default|Normal)(\s*,|$)/i.test(variant.name)

  const chosen = variants.find(isDefault) ?? variants[0]!
  const ignored = variants.filter((variant) => variant !== chosen).map((variant) => variant.name)

  if (ignored.length > 0) {
    bag.info(
      RULES.variantIgnored,
      `Exportei a variante "${chosen.name}". As outras ${ignored.length} nao vao no pacote: no ` +
        'MVP os estados vem do prefab do kit, por tint de cor.',
      selected,
    )
  }

  return { source: chosen, ignoredVariants: ignored }
}

/**
 * Descobre os slots do componente.
 *
 * Duas fontes, nesta ordem: as propriedades de componente que o Figma ja declara, que e o que
 * o gerador do kit cria; e o prefixo `$` no nome da layer, para componente montado a mao. Sem
 * nenhuma das duas o componente ate exporta, mas chega na Unity como casca que ninguem
 * consegue preencher — por isso a ausencia vira aviso.
 */
function collectSlots(root: SceneNode, ctx: Ctx): KitSlot[] {
  const slots: KitSlot[] = []
  const taken = new Set<string>()

  const add = (rawName: string, node: SceneNode): void => {
    const name = toSlotName(rawName)
    if (name === null) return

    if (taken.has(name)) {
      ctx.bag.warn(
        RULES.duplicateSlot,
        `O slot "${name}" foi declarado mais de uma vez; vale o primeiro.`,
        node,
      )
      return
    }

    taken.add(name)
    slots.push({ name, nodeId: node.id })
  }

  const walk = (node: SceneNode): void => {
    // Layer com "$" no nome e declaracao explicita e ganha do resto.
    if (node.name.startsWith('$')) {
      add(node.name.slice(1), node)
    } else {
      const references = readPropertyReferences(node)
      for (const key of references) add(key, node)
    }

    // Nao entra em instancia aninhada: o interior dela pertence ao componente dela.
    if (node.type === 'INSTANCE') return
    if (!('children' in node)) return

    for (const child of node.children) walk(child)
  }

  if ('children' in root) {
    for (const child of root.children) walk(child)
  }

  if (slots.length === 0) {
    ctx.bag.warn(
      RULES.noSlots,
      'O componente nao declara nenhum slot, entao o importador nao tem onde escrever texto ou ' +
        'icone. Renomeie as layers que recebem conteudo com "$" na frente — por exemplo "$label".',
      root,
    )
  }

  return slots
}

/** Nomes de propriedade do Figma vem sufixados com um id interno: `label#1:23`. */
function readPropertyReferences(node: SceneNode): string[] {
  let raw: SceneNode['componentPropertyReferences']
  try {
    raw = node.componentPropertyReferences
  } catch {
    return []
  }

  if (raw === null || typeof raw !== 'object') return []

  const names: string[] = []

  for (const value of Object.values(raw)) {
    if (typeof value !== 'string') continue
    const base = value.split('#')[0]?.trim()
    if (base !== undefined && base.length > 0) names.push(base)
  }

  return names
}

/** Slot vira nome de campo no `UIKitComponent`, entao segue o mesmo formato restrito. */
function toSlotName(raw: string): string | null {
  const cleaned = raw.trim().replace(/[^A-Za-z0-9]/g, '')
  if (cleaned.length === 0 || !/^[A-Za-z]/.test(cleaned)) return null
  return cleaned[0]!.toLowerCase() + cleaned.slice(1)
}

/**
 * Papel do componente. O designer escolhe; sem escolha, o nome canonico decide.
 *
 * O palpite pelo nome existe para o caminho comum — `Button/Primary` e obviamente um botao —
 * e nao para adivinhar caso dificil: na duvida, `display`, que e o papel que nao promete
 * comportamento nenhum.
 */
function inferRole(canonicalName: string, explicit: KitRole | undefined): KitRole {
  if (explicit !== undefined) return explicit

  const family = canonicalName.split('/')[0]?.toLowerCase() ?? ''

  if (family.startsWith('button')) return 'button'
  if (family.startsWith('toggle')) return 'toggle'
  if (family.startsWith('icon')) return 'icon'
  if (family.startsWith('image')) return 'image'
  if (family.startsWith('panel') || family.startsWith('window')) return 'container'

  return 'display'
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
      const assetId = await registerAsset(node, name, ctx, parsed.nineSlice)
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

async function registerAsset(
  node: SceneNode,
  name: string,
  ctx: Ctx,
  annotated: NineSlice | null,
): Promise<string | null> {
  const { assetScale, exportAssets } = ctx.opts

  if (node.width <= 0 || node.height <= 0) {
    ctx.bag.warn(
      RULES.complexVector,
      'Layer sem area nao pode ser rasterizada e foi exportada como container vazio.',
      node,
    )
    return null
  }

  const id =
    ctx.kitName !== null
      ? toKitAssetId(ctx.kitName, name, ctx.takenAssetIds)
      : toAssetId(name, node.id)

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

  const nineSlice = resolveNineSlice(node, annotated, ctx)
  if (nineSlice !== undefined) asset.nineSlice = nineSlice

  reportAssetSize(asset, node, ctx)

  ctx.assets.push(asset)

  return id
}

/** Acima disto o `maxTextureSize` padrao da Unity reduz a textura na importacao. */
const MAX_TEXTURE_SIZE = 2048

/**
 * Avisa sobre dimensoes que custam caro na Unity. Nunca altera o pixel.
 *
 * O que realmente importa aqui e ser **multiplo de 4**: compressao em blocos (ASTC, DXT,
 * ETC) so funciona nessa condicao, e sem ela a textura fica em RGBA32, varias vezes maior na
 * memoria. Potencia de 2 e muito menos relevante para UI em UGUI — vale registrar, nao vale
 * alarmar —, e o caminho certo para resolver as duas coisas de uma vez e um SpriteAtlas.
 */
function reportAssetSize(asset: Asset, node: SceneNode, ctx: Ctx): void {
  const { width, height } = asset

  if (width > MAX_TEXTURE_SIZE || height > MAX_TEXTURE_SIZE) {
    ctx.bag.warn(
      RULES.assetOversized,
      `${width}x${height}px passa do limite padrao de ${MAX_TEXTURE_SIZE}px, entao a Unity vai ` +
        'reduzir a textura na importacao e a imagem sai menos nitida do que voce desenhou.',
      node,
    )
  }

  if (width % 4 !== 0 || height % 4 !== 0) {
    ctx.bag.warn(
      RULES.assetNotMultipleOfFour,
      `${width}x${height}px nao e multiplo de 4, entao a compressao em blocos nao se aplica e a ` +
        'textura ocupa varias vezes mais memoria. O importador pode corrigir com preenchimento ' +
        'transparente, ou ajuste o tamanho da layer no Figma.',
      node,
    )
  }

  // Potencia de 2 NAO entra aqui, de proposito. Quase todo sprite de UI e NPOT e isso nao e
  // problema em UGUI: o que quebra compressao e nao ser multiplo de 4, ja coberto acima.
  // Avisar sobre POT em cada asset encheria o relatorio de ruido e mataria a meta de exportar
  // com zero avisos. Quem quiser o numero encontra as dimensoes no relatorio de import da
  // Unity, que e onde a textura de fato e configurada.
}

/**
 * Bordas de 9-slice do asset: anotacao explicita primeiro, derivacao pelo raio depois.
 *
 * A anotacao vence sempre, inclusive numa tela — e a forma de o designer descrever uma area
 * esticavel que o desenho nao deixa inferir. A derivacao so entra no export de componente,
 * por `deriveSlices`.
 */
function resolveNineSlice(
  node: SceneNode,
  annotated: NineSlice | null,
  ctx: Ctx,
): NineSlice | undefined {
  if (annotated !== null) {
    const clamped = clampNineSlice(annotated, node.width, node.height)

    if (clamped === undefined) {
      ctx.bag.warn(
        RULES.nineSliceTooLarge,
        `As bordas anotadas nao cabem numa layer de ${round(node.width)}x${round(node.height)} ` +
          'e foram ignoradas.',
        node,
      )
      return undefined
    }

    if (wasClamped(annotated, clamped)) {
      ctx.bag.warn(
        RULES.nineSliceTooLarge,
        `As bordas anotadas nao cabiam na layer e foram reduzidas para ` +
          `[${clamped.join(', ')}]. A Unity exige que as bordas opostas somem menos que o lado.`,
        node,
      )
    }

    return clamped
  }

  if (ctx.opts.deriveSlices !== true) return undefined

  return deriveNineSlice(node)
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

export function readSource(): Source {
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
