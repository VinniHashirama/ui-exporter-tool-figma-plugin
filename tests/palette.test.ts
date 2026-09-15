import { describe, expect, it } from 'vitest'
import { CORE_PALETTE_KEYS, DEFAULT_PALETTE, hexToRgb, isCorePaletteKey, rgbToHex } from '../src/palette'

/**
 * `loadPalette`/`upsertPaletteColor`/`removePaletteColor` tocam `figma.getLocalPaintStylesAsync`
 * e `figma.createPaintStyle`, que `tests/figma-mock.ts` não simula (o mock cobre só a
 * superfície que `traverse.ts` toca). Testar essa parte exigiria simular Paint Style inteiro
 * só para este arquivo — não vale o custo; fica para QA manual no Figma.
 *
 * O que dá para testar sem Figma nenhum é a conversão hex/RGB, que é o miolo de
 * `loadPalette`/`upsertPaletteColor` — é o que este arquivo cobre.
 */
describe('hexToRgb / rgbToHex', () => {
  it('faz o round-trip dos valores default do kit', () => {
    for (const key of CORE_PALETTE_KEYS) {
      const hex = DEFAULT_PALETTE[key]
      const rgb = hexToRgb(hex)
      expect(rgb, `'${hex}' deveria ser um hex válido`).not.toBeNull()
      expect(rgbToHex(rgb!)).toBe(hex)
    }
  })

  it('converte hex conhecido para RGB 0-1', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(hexToRgb('#ffffff')).toEqual({ r: 1, g: 1, b: 1 })
    expect(hexToRgb('#0d99ff')).toEqual({ r: 13 / 255, g: 153 / 255, b: 1 })
  })

  it('aceita maiúscula e minúscula', () => {
    expect(hexToRgb('#ABCDEF')).toEqual(hexToRgb('#abcdef'))
  })

  it('rejeita o que não é #rrggbb', () => {
    expect(hexToRgb('123456')).toBeNull()
    expect(hexToRgb('#12345')).toBeNull()
    expect(hexToRgb('#1234567')).toBeNull()
    expect(hexToRgb('#gggggg')).toBeNull()
    expect(hexToRgb('')).toBeNull()
    // Cor vem de campo de texto da UI — dado não confiável, então nada de aceitar CSS
    // extra que o navegador entenderia (rgb(), nomes, atalho de 3 dígitos).
    expect(hexToRgb('#fff')).toBeNull()
    expect(hexToRgb('red')).toBeNull()
  })

  it('rgbToHex arredonda e satura fora de [0,1]', () => {
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000')
    expect(rgbToHex({ r: 1, g: 1, b: 1 })).toBe('#ffffff')
    expect(rgbToHex({ r: -1, g: 2, b: 0.5 })).toBe('#00ff80')
  })
})

describe('CORE_PALETTE_KEYS / DEFAULT_PALETTE', () => {
  it('toda chave central tem um default', () => {
    for (const key of CORE_PALETTE_KEYS) {
      expect(DEFAULT_PALETTE[key], `'${key}' sem default`).toBeTruthy()
    }
  })

  it('isCorePaletteKey aceita só as 8 chaves estruturais', () => {
    for (const key of CORE_PALETTE_KEYS) {
      expect(isCorePaletteKey(key)).toBe(true)
    }

    // Chave de cor customizada vem da UI — outro contexto de execução, não confiável.
    expect(isCorePaletteKey('hud-danger')).toBe(false)
    expect(isCorePaletteKey('')).toBe(false)
  })

  it('não tem chave central repetida', () => {
    expect(new Set(CORE_PALETTE_KEYS).size).toBe(CORE_PALETTE_KEYS.length)
  })
})
