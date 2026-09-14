import { describe, expect, it } from 'vitest'
import { clampNineSlice, deriveNineSlice, wasClamped } from '../src/mappers/geometry'
import { parseName } from '../src/naming'

/**
 * O 9-slice e o que impede um fundo de botao de distorcer ao esticar. Ate agora o campo
 * existia no contrato e nunca era preenchido, entao estes testes cobrem a estreia da
 * derivacao — e, principalmente, os dois casos em que ela erra silenciosamente.
 */

/** Node so com o que `deriveNineSlice` le. */
function node(overrides: Record<string, unknown>): SceneNode {
  return { width: 320, height: 96, ...overrides } as unknown as SceneNode
}

describe('derivacao de 9-slice pelo raio', () => {
  it('raio uniforme vira as quatro arestas', () => {
    expect(deriveNineSlice(node({ cornerRadius: 20 }))).toEqual([20, 20, 20, 20])
  })

  it('sem raio nao gera borda', () => {
    expect(deriveNineSlice(node({ cornerRadius: 0 }))).toBeUndefined()
  })

  it('cantos assimetricos: cada aresta pega o MAIOR dos dois cantos que toca', () => {
    // O teste que pega o bug. Cantos sao [TL, TR, BR, BL] e arestas sao
    // [top, right, bottom, left]: copiar elemento a elemento passaria em qualquer teste
    // com raio uniforme e sairia errado exatamente aqui.
    const asymmetric = node({
      cornerRadius: Symbol('mixed'),
      topLeftRadius: 24,
      topRightRadius: 8,
      bottomRightRadius: 4,
      bottomLeftRadius: 12,
    })

    expect(deriveNineSlice(asymmetric)).toEqual([
      24, // top    = max(TL 24, TR 8)
      8, //  right  = max(TR 8,  BR 4)
      12, // bottom = max(BR 4,  BL 12)
      24, // left   = max(BL 12, TL 24)
    ])
  })

  it('traco entra na borda, porque a linha tambem deforma ao esticar', () => {
    const stroked = node({
      cornerRadius: 10,
      strokes: [{ type: 'SOLID' }],
      strokeWeight: 4,
    })

    expect(deriveNineSlice(stroked)).toEqual([14, 14, 14, 14])
  })

  it('lista de tracos vazia nao soma nada', () => {
    expect(deriveNineSlice(node({ cornerRadius: 10, strokes: [], strokeWeight: 4 })))
      .toEqual([10, 10, 10, 10])
  })

  it('pilula: o raio cabe no sprite em vez de degenerar', () => {
    // Botao 56x56 com raio 28 — o formato mais comum que existe. Sem clamp as bordas
    // somariam 56 numa textura de 56px e a Unity nao teria area esticavel nenhuma.
    const pill = node({ width: 56, height: 56, cornerRadius: 28 })

    const result = deriveNineSlice(pill)!

    expect(result).toEqual([27, 27, 27, 27])
    expect(result[1] + result[3]).toBeLessThan(56)
    expect(result[0] + result[2]).toBeLessThan(56)
  })

  it('clamp respeita cada eixo separadamente', () => {
    // Barra larga e baixa: o eixo vertical aperta, o horizontal nao.
    const bar = clampNineSlice([40, 40, 40, 40], 400, 40)

    expect(bar).toEqual([19, 40, 19, 40])
  })

  it('node minusculo perde a borda inteira em vez de gerar sprite invalido', () => {
    expect(clampNineSlice([4, 4, 4, 4], 2, 2)).toBeUndefined()
  })

  it('wasClamped so acusa quando encolheu de verdade', () => {
    expect(wasClamped([28, 28, 28, 28], [27, 27, 27, 27])).toBe(true)
    expect(wasClamped([20, 20, 20, 20], [20, 20, 20, 20])).toBe(false)
  })
})

describe('anotacao #9s no nome da layer', () => {
  it('quatro valores viram as quatro arestas', () => {
    expect(parseName('frame#9s(1,2,3,4)').nineSlice).toEqual([1, 2, 3, 4])
  })

  it('um valor vale para todas', () => {
    expect(parseName('frame#9s(12)').nineSlice).toEqual([12, 12, 12, 12])
  })

  it('dois valores sao vertical e horizontal, como no CSS', () => {
    expect(parseName('frame#9s(8,16)').nineSlice).toEqual([8, 16, 8, 16])
  })

  it('tres valores completam o bottom com o top', () => {
    expect(parseName('frame#9s(8,16,4)').nineSlice).toEqual([8, 16, 4, 16])
  })

  it('o sufixo sai do nome limpo', () => {
    expect(parseName('janela#9s(12)').clean).toBe('janela')
  })

  it('convive com os outros sufixos, em qualquer ordem', () => {
    const a = parseName('hero#img#9s(6)')
    expect(a.flatten).toBe(true)
    expect(a.nineSlice).toEqual([6, 6, 6, 6])
    expect(a.clean).toBe('hero')

    const b = parseName('@Frame#9s(6):loc.x')
    expect(b.bind).toBe('Frame')
    expect(b.locKey).toBe('loc.x')
    expect(b.nineSlice).toEqual([6, 6, 6, 6])
  })

  it('sem anotacao devolve null, e a derivacao pelo raio assume', () => {
    expect(parseName('frame').nineSlice).toBeNull()
    expect(parseName('frame#9s()').nineSlice).toBeNull()
    expect(parseName('frame#9s(a,b)').nineSlice).toBeNull()
  })
})
