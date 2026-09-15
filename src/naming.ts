/**
 * Convencoes de nome de layer. A spec para designers esta em
 * https://github.com/VinniHashirama/ui-exporter-tool-docs-and-samples/blob/main/docs/figma-conventions.md
 * — mudou aqui, atualize o doc.
 *
 *   _nome            layer ignorada no export
 *   @Nome            o dev acessa por codigo  -> vira bind
 *   nome#img         achatar em PNG
 *   nome#9s(t,r,b,l) bordas de 9-slice explicitas
 *   nome:loc.chave   texto localizado         -> vira locKey
 */

/** Arestas em ordem CSS: [top, right, bottom, left]. */
export type NineSlice = [number, number, number, number]

export interface ParsedName {
  /** Nome limpo de todas as convencoes. Vira o nome do GameObject. */
  clean: string
  /** Conteudo cru depois do '@', antes de validar. null quando nao ha '@'. */
  bind: string | null
  flatten: boolean
  locKey: string | null
  ignored: boolean
  /** Bordas anotadas a mao. null quando ausentes — ai a derivacao pelo raio assume. */
  nineSlice: NineSlice | null
}

const LOC_SUFFIX = /:([A-Za-z0-9_.-]+)$/
const IMG_SUFFIX = /#img$/i

/**
 * `#9s(12,12,12,12)` ou `#9s(12)` para as quatro arestas iguais.
 *
 * Existe para o caso que a derivacao pelo raio nao cobre: moldura com borda decorada mais
 * larga que o raio, ou arte cuja area esticavel o desenho nao deixa inferir.
 */
const NINE_SLICE_SUFFIX = /#9s\(\s*(\d+(?:\s*,\s*\d+){0,3})\s*\)$/i
const SCREEN_PREFIX = /^screen\/([A-Za-z][A-Za-z0-9_]*)$/
const BIND_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const CANONICAL_PATTERN = /^[A-Za-z][A-Za-z0-9]*(\/[A-Za-z][A-Za-z0-9]*)*$/

/**
 * Whitelist do que pode sobreviver num nome de GameObject: letras (com acento),
 * digitos, espaco, ponto, underscore, parenteses e hifen. Tudo o mais cai fora —
 * inclusive os caracteres invalidos em path no Windows e os de controle.
 *
 * Whitelist e nao blacklist de proposito: nome de layer e conteudo de designer, ou
 * seja, dado nao confiavel. Enumerar o permitido nao tem como deixar passar surpresa.
 */
const DISALLOWED_NAME_CHARS = /[^\p{L}\p{N} ._()-]/gu

const MAX_NAME_LENGTH = 64

export function parseName(raw: string): ParsedName {
  let working = raw.trim()

  if (working.startsWith('_')) {
    return {
      clean: sanitizeName(working),
      bind: null,
      flatten: false,
      locKey: null,
      ignored: true,
      nineSlice: null,
    }
  }

  let locKey: string | null = null
  let flatten = false
  let nineSlice: NineSlice | null = null

  // Os sufixos podem vir em qualquer ordem (`hero#img:loc.x` ou `hero:loc.x#img`), entao
  // descascamos em loop ate nao sobrar nenhum. Todas as regex sao ancoradas no fim, entao
  // replace() basta e dispensa mexer com match.index. O limite acompanha o numero de
  // sufixos: menos que isso deixaria de descascar o ultimo.
  for (let pass = 0; pass < 3; pass++) {
    const loc = working.match(LOC_SUFFIX)
    if (loc?.[1] !== undefined) {
      locKey = loc[1]
      working = working.replace(LOC_SUFFIX, '').trim()
      continue
    }
    const slice = working.match(NINE_SLICE_SUFFIX)
    if (slice?.[1] !== undefined) {
      nineSlice = parseNineSlice(slice[1])
      working = working.replace(NINE_SLICE_SUFFIX, '').trim()
      continue
    }
    if (IMG_SUFFIX.test(working)) {
      flatten = true
      working = working.replace(IMG_SUFFIX, '').trim()
      continue
    }
    break
  }

  let bind: string | null = null
  if (working.startsWith('@')) {
    const candidate = working.slice(1).trim()
    // Bind invalido nao e descartado em silencio: devolvemos o valor cru e o lint
    // reclama via isValidBind().
    bind = candidate.length > 0 ? candidate : null
    working = candidate
  }

  return { clean: sanitizeName(working), bind, flatten, locKey, ignored: false, nineSlice }
}

/**
 * `12` vira as quatro arestas; `12,8` vira vertical/horizontal; `12,8,4` completa o
 * `bottom` faltante com o `top`, como no CSS.
 */
function parseNineSlice(raw: string): NineSlice | null {
  const parts = raw.split(',').map((part) => Number(part.trim()))

  if (parts.some((value) => !Number.isFinite(value) || value < 0)) return null

  const [a, b, c, d] = parts

  if (a === undefined) return null
  if (b === undefined) return [a, a, a, a]
  if (c === undefined) return [a, b, a, b]
  if (d === undefined) return [a, b, c, b]

  return [a, b, c, d]
}

export function isValidBind(bind: string): boolean {
  return BIND_PATTERN.test(bind)
}

/** `screen/HomeMenu` -> `HomeMenu`. Retorna null se estiver fora do padrao. */
export function parseScreenName(raw: string): string | null {
  return raw.trim().match(SCREEN_PREFIX)?.[1] ?? null
}

/**
 * O sufixo que o designer digita para criar uma tela nova, sem o prefixo `screen/`.
 *
 * Mesma regra de `SCREEN_PREFIX`, exposta a parte: a UI valida o campo antes de mandar a
 * mensagem, e o sandbox valida de novo do lado dele, porque e outro contexto de execucao.
 */
export function isValidScreenSuffix(raw: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(raw.trim())
}

/** Torna o nome seguro para virar nome de GameObject e componente de path. */
export function sanitizeName(raw: string): string {
  const cleaned = raw
    .replace(DISALLOWED_NAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Windows nao aceita nome terminando em ponto ou espaco.
    .replace(/[.\s]+$/, '')
    .slice(0, MAX_NAME_LENGTH)
    .trim()

  return cleaned.length > 0 ? cleaned : 'Node'
}

/** Sanitiza para o padrao de assetId do schema: ^[A-Za-z0-9_-]+$ */
export function toAssetId(name: string, nodeId: string): string {
  const base = name
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  // node id do Figma tem ':' e ';' — vira sufixo, garantindo unicidade sem colisao.
  const suffix = nodeId.replace(/[^A-Za-z0-9]+/g, '-')
  return `${base.length > 0 ? base : 'asset'}_${suffix}`
}

/**
 * Id de asset de um componente do kit: `button-primary_bg_default`.
 *
 * Segue a spec de entrega de arte (`prefab-kit.md`): `<componente>_<parte>_<estado>`. Nao usa
 * o esquema de `toAssetId`, que sufixa o id do node — aquele existe para a reconciliacao de
 * tela e produziria nomes ilegiveis para arte que o artista vai abrir e editar.
 *
 * O `_default` fica desde ja para os estados que virao: renomear asset depois transformaria
 * os existentes em orfaos dentro dos prefabs que ja os referenciam.
 */
export function toKitAssetId(
  canonicalName: string,
  layerName: string,
  taken: Set<string>,
): string {
  const component = toKebab(canonicalName) || 'component'
  const part = toKebab(layerName) || 'asset'

  const base = `${component}_${part}_default`.slice(0, 90)

  if (!taken.has(base)) {
    taken.add(base)
    return base
  }

  // Duas layers com o mesmo nome dentro do componente: desempata sem perder legibilidade.
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) {
      taken.add(candidate)
      return candidate
    }
  }
}

/** `Item Slot` / `itemSlot` -> `item-slot`. Usado para nome de asset e de cor customizada. */
export function toKebab(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Sanitiza para o padrao de tokenRef do schema: ^[A-Za-z0-9_.-]+$ */
export function toTokenRef(styleName: string): string | null {
  const ref = styleName
    .trim()
    .replace(/\s*\/\s*/g, '.')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9_.-]+/g, '')
    .replace(/^[.-]+|[.-]+$/g, '')

  return ref.length > 0 ? ref : null
}

const DEFAULT_NAME_NUMBERED =
  /^(frame|group|rectangle|ellipse|line|star|polygon|component|instance|slice|text|image)\s+\d+$/i
const DEFAULT_NAME_BARE = /^(vector|union|subtract|intersect|exclude)$/i

/** Detecta nome automatico do Figma (`Frame 42`, `Rectangle 5`, `Vector`). */
export function isDefaultLayerName(raw: string): boolean {
  const name = raw.trim()
  return DEFAULT_NAME_NUMBERED.test(name) || DEFAULT_NAME_BARE.test(name)
}

/**
 * Normaliza o nome de um componente para o padrao canonico do schema.
 *
 * `Button / Primary` -> `Button/Primary`
 * `window modal`     -> `WindowModal`
 *
 * Retorna null quando nao da para normalizar — o chamador reporta unknown-component.
 */
export function normalizeCanonicalName(raw: string): string | null {
  const segments = raw
    .split('/')
    .map((segment) => toPascalCase(segment))
    .filter((segment) => segment.length > 0)

  if (segments.length === 0) return null

  const joined = segments.join('/')
  return CANONICAL_PATTERN.test(joined) ? joined : null
}

function toPascalCase(raw: string): string {
  return raw
    .trim()
    .split(/[\s_-]+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter((word) => word.length > 0)
    // Preserva capitalizacao interna (`XP`, `HUD`) e garante inicial maiuscula.
    .map((word) => (/^[A-Z]/.test(word) ? word : word[0]!.toUpperCase() + word.slice(1)))
    .join('')
}
