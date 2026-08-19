/**
 * Convencoes de nome de layer. A spec para designers esta em
 * https://github.com/VinniHashirama/ui-exporter-tool-docs-and-samples/blob/main/docs/figma-conventions.md
 * — mudou aqui, atualize o doc.
 *
 *   _nome           layer ignorada no export
 *   @Nome           o dev acessa por codigo  -> vira bind
 *   nome#img        achatar em PNG
 *   nome:loc.chave  texto localizado         -> vira locKey
 */

export interface ParsedName {
  /** Nome limpo de todas as convencoes. Vira o nome do GameObject. */
  clean: string
  /** Conteudo cru depois do '@', antes de validar. null quando nao ha '@'. */
  bind: string | null
  flatten: boolean
  locKey: string | null
  ignored: boolean
}

const LOC_SUFFIX = /:([A-Za-z0-9_.-]+)$/
const IMG_SUFFIX = /#img$/i
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
    return { clean: sanitizeName(working), bind: null, flatten: false, locKey: null, ignored: true }
  }

  let locKey: string | null = null
  let flatten = false

  // Os dois sufixos podem vir em qualquer ordem (`hero#img:loc.x` ou `hero:loc.x#img`),
  // entao descascamos em loop ate nao sobrar nenhum. Ambas as regex sao ancoradas no
  // fim, entao replace() basta e dispensa mexer com match.index.
  for (let pass = 0; pass < 2; pass++) {
    const loc = working.match(LOC_SUFFIX)
    if (loc?.[1] !== undefined) {
      locKey = loc[1]
      working = working.replace(LOC_SUFFIX, '').trim()
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

  return { clean: sanitizeName(working), bind, flatten, locKey, ignored: false }
}

export function isValidBind(bind: string): boolean {
  return BIND_PATTERN.test(bind)
}

/** `screen/HomeMenu` -> `HomeMenu`. Retorna null se estiver fora do padrao. */
export function parseScreenName(raw: string): string | null {
  return raw.trim().match(SCREEN_PREFIX)?.[1] ?? null
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
