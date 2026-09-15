/**
 * Paleta de cor do kit, com a verdade nos Paint Styles do arquivo (`color/<key>`) em vez de
 * numa constante do codigo.
 *
 * O Figma ja propaga Paint Style para toda instancia vinculada a ele — entao "editar a
 * paleta e refletir nos componentes" e de graca desde que o gerador (`kit-builder.ts`) pare
 * de escrever cor literal a partir de uma constante e passe a ler/gravar estes mesmos
 * estilos. Este modulo, ao contrario de `kit.ts`, pode tocar a API do Figma: quem importa a
 * UI do plugin nao importa este arquivo.
 */

const STYLE_PREFIX = 'color/'

/**
 * As 8 chaves que os construtores do kit referenciam pelo nome (`kit-builder.ts`). Nao dá
 * pra remover — só recolorir — porque sumir com uma quebraria a leitura de `ctx.palette` nos
 * construtores.
 */
export const CORE_PALETTE_KEYS = [
  'background',
  'surface',
  'surface-raised',
  'primary',
  'primary-muted',
  'text',
  'text-muted',
  'track',
] as const

export type CorePaletteKey = (typeof CORE_PALETTE_KEYS)[number]

const CORE_PALETTE_SET: ReadonlySet<string> = new Set(CORE_PALETTE_KEYS)

export function isCorePaletteKey(key: string): key is CorePaletteKey {
  return CORE_PALETTE_SET.has(key)
}

/** Os mesmos valores de sempre do UIKitFactory da Unity, so que em hex em vez de RGB 0-1. */
export const DEFAULT_PALETTE: Record<CorePaletteKey, string> = {
  background: '#12141f',
  surface: '#292b38',
  'surface-raised': '#383b4a',
  primary: '#0d99ff',
  'primary-muted': '#4d5466',
  text: '#f2f5fa',
  'text-muted': '#9ea6b8',
  track: '#1f212b',
}

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/

export function hexToRgb(hex: string): RGB | null {
  if (!HEX_PATTERN.test(hex)) return null

  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  }
}

export function rgbToHex(rgb: RGB): string {
  const channel = (value: number): string =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`
}

export interface PaletteEntry {
  key: string
  hex: string
  /** Uma das 8 chaves estruturais — protegida contra remoção, não contra recoloração. */
  core: boolean
  /** false quando é uma chave central ainda sem Paint Style no arquivo. */
  exists: boolean
}

function styleName(key: string): string {
  return `${STYLE_PREFIX}${key}`
}

function firstSolidHex(style: PaintStyle): string | null {
  const paint = style.paints.find((item): item is SolidPaint => item.type === 'SOLID')
  return paint === undefined ? null : rgbToHex(paint.color)
}

async function findColorStyle(key: string): Promise<PaintStyle | undefined> {
  const name = styleName(key)
  const styles = await figma.getLocalPaintStylesAsync()
  return styles.find((style) => style.name === name)
}

/**
 * Le a paleta de verdade do arquivo. Sintetiza uma entrada para cada chave central que ainda
 * não tem estilo (`exists: false`), para a aba Cores servir de algo mesmo num arquivo novo,
 * antes de qualquer kit existir. Não tem efeito colateral.
 */
export async function loadPalette(): Promise<PaletteEntry[]> {
  const entries = new Map<string, PaletteEntry>()

  for (const style of await figma.getLocalPaintStylesAsync()) {
    if (!style.name.startsWith(STYLE_PREFIX)) continue

    const key = style.name.slice(STYLE_PREFIX.length)
    if (key.length === 0) continue

    const hex = firstSolidHex(style)
    if (hex === null) continue // sem fill solido, nao ha cor unica pra mostrar

    entries.set(key, { key, hex, core: isCorePaletteKey(key), exists: true })
  }

  for (const key of CORE_PALETTE_KEYS) {
    if (!entries.has(key)) {
      entries.set(key, { key, hex: DEFAULT_PALETTE[key], core: true, exists: false })
    }
  }

  const core = CORE_PALETTE_KEYS.map((key) => entries.get(key)!)
  const custom = [...entries.values()]
    .filter((entry) => !entry.core)
    .sort((a, b) => a.key.localeCompare(b.key))

  return [...core, ...custom]
}

export async function upsertPaletteColor(key: string, hex: string): Promise<void> {
  const rgb = hexToRgb(hex)
  if (rgb === null) {
    throw new Error(`'${hex}' não é uma cor hexadecimal válida (use #rrggbb).`)
  }

  const style = (await findColorStyle(key)) ?? figma.createPaintStyle()
  style.name = styleName(key)
  style.paints = [{ type: 'SOLID', color: rgb, opacity: 1 }]
}

export async function removePaletteColor(key: string): Promise<'removed' | 'not-found'> {
  const style = await findColorStyle(key)
  if (style === undefined) return 'not-found'

  style.remove()
  return 'removed'
}
