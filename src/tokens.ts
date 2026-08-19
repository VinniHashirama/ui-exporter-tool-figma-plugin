import { toTokenRef } from './naming'
import type { Color, Tokens, TokenRef, TypographyToken } from './uiir'

/**
 * Resolve estilos do Figma em referencias de token e acumula a tabela que vai no IR.
 *
 * O IR carrega o valor JA resolvido em cada node — o token e informativo. Entao um
 * estilo que nao resolve (apagado, de biblioteca sem acesso) degrada para "sem token",
 * nunca para "sem cor".
 */
export class TokenCollector {
  private readonly nameCache = new Map<string, string | null>()
  private readonly colors = new Map<string, Color>()
  private readonly typography = new Map<string, TypographyToken>()

  async colorToken(styleId: string | symbol | undefined, value: Color): Promise<TokenRef | undefined> {
    const ref = await this.resolve(styleId)
    if (ref === null) return undefined
    this.colors.set(ref, value)
    return ref
  }

  async typographyToken(
    styleId: string | symbol | undefined,
    value: TypographyToken,
  ): Promise<TokenRef | undefined> {
    const ref = await this.resolve(styleId)
    if (ref === null) return undefined
    this.typography.set(ref, value)
    return ref
  }

  /** Retorna undefined quando nao ha nenhum token — o campo fica fora do JSON. */
  build(): Tokens | undefined {
    const tokens: Tokens = {}
    if (this.colors.size > 0) tokens.colors = sortedRecord(this.colors)
    if (this.typography.size > 0) tokens.typography = sortedRecord(this.typography)
    return this.colors.size + this.typography.size > 0 ? tokens : undefined
  }

  private async resolve(styleId: string | symbol | undefined): Promise<TokenRef | null> {
    // figma.mixed e um symbol: node com mais de um estilo nao tem token unico.
    if (typeof styleId !== 'string' || styleId.length === 0) return null

    const cached = this.nameCache.get(styleId)
    if (cached !== undefined) return cached

    let ref: string | null = null
    try {
      const style = await figma.getStyleByIdAsync(styleId)
      ref = style !== null ? toTokenRef(style.name) : null
    } catch {
      // Estilo de biblioteca sem acesso ou id invalido: segue sem token.
      ref = null
    }

    this.nameCache.set(styleId, ref)
    return ref
  }
}

/** Ordem estavel para o JSON — evita diff espurio entre dois exports iguais. */
function sortedRecord<T>(map: Map<string, T>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const key of [...map.keys()].sort()) {
    out[key] = map.get(key)!
  }
  return out
}
