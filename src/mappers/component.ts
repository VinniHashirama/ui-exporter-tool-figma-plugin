import type { DiagnosticBag } from '../diagnostics'
import { RULES } from '../diagnostics'
import { isKnownComponent, LABEL_PROPERTY_NAMES } from '../kit'
import { normalizeCanonicalName } from '../naming'
import type { ComponentRef } from '../uiir'

/**
 * Resolve a instancia para uma referencia canonica do kit.
 *
 * O nome canonico vem do ComponentSet quando existe: variantes vivem sob um set chamado
 * `Button/Primary` e cada variante se chama `State=Default, Size=M`. Usar o nome da
 * variante daria um canonicalName diferente por combinacao de variante.
 */
export async function mapComponent(
  node: InstanceNode,
  bag: DiagnosticBag,
): Promise<ComponentRef | undefined> {
  let main: ComponentNode | null = null
  try {
    main = await node.getMainComponentAsync()
  } catch {
    main = null
  }

  if (main === null) {
    bag.warn(
      RULES.unknownComponent,
      'Instancia sem componente de origem acessivel. Na Unity vira caixa generica, sem comportamento.',
      node,
    )
    return undefined
  }

  const set = main.parent?.type === 'COMPONENT_SET' ? main.parent : null
  const rawName = set !== null ? set.name : main.name
  const canonicalName = normalizeCanonicalName(rawName)

  if (canonicalName === null) {
    bag.warn(
      RULES.unknownComponent,
      `Nome de componente "${rawName}" nao pode ser normalizado. Use nomes como "Button/Primary".`,
      node,
    )
    return undefined
  }

  if (!isKnownComponent(canonicalName)) {
    bag.warn(
      RULES.unknownComponent,
      `"${canonicalName}" nao esta no kit v1. Na Unity vira caixa generica, sem comportamento — peca o componente ao dono da Library.`,
      node,
    )
  }

  const component: ComponentRef = { canonicalName }

  const key = set !== null ? set.key : main.key
  if (typeof key === 'string' && key.length > 0) component.setKey = key

  const properties = readProperties(node)

  // Componente sem propriedade de texto declarada, mas com texto dentro: o importador
  // precisa desse valor para preencher o slot `label` do prefab.
  if (!hasLabel(properties)) {
    const inner = findFirstText(node)
    if (inner !== null) properties['label'] = inner
  }

  if (Object.keys(properties).length > 0) component.properties = properties

  return component
}

function readProperties(node: InstanceNode): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}

  let raw: InstanceNode['componentProperties']
  try {
    raw = node.componentProperties
  } catch {
    return out
  }
  if (raw === null || typeof raw !== 'object') return out

  for (const [rawKey, entry] of Object.entries(raw)) {
    // Propriedade nao-variante vem sufixada com um id interno: `label#1:23`.
    const key = rawKey.split('#')[0]?.trim()
    if (key === undefined || key.length === 0) continue

    const value = entry?.value
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
    }
  }

  return out
}

function hasLabel(properties: Record<string, unknown>): boolean {
  const keys = Object.keys(properties).map((key) => key.toLowerCase())
  return LABEL_PROPERTY_NAMES.some((name) => keys.includes(name))
}

/**
 * Primeiro texto visivel em profundidade. Nao entramos em instancias aninhadas: o texto
 * delas pertence ao proprio componente, nao a este.
 */
function findFirstText(node: SceneNode): string | null {
  if (node.visible === false) return null
  if (node.type === 'TEXT') {
    const value = node.characters.trim()
    return value.length > 0 ? value : null
  }
  if (!('children' in node)) return null

  for (const child of node.children) {
    if (child.type === 'INSTANCE') continue
    const found = findFirstText(child)
    if (found !== null) return found
  }
  return null
}
