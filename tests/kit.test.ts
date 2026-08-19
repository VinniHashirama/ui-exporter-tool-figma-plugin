import { describe, expect, it } from 'vitest'
import { KIT_COMPONENT_NAMES, SCREEN_TEMPLATE_NAME } from '../src/kit-builder'
import { isKnownComponent, KIT_V1 } from '../src/kit'
import { normalizeCanonicalName, parseScreenName } from '../src/naming'

/**
 * O gerador do Figma e o do kit da Unity existem para que os nomes canônicos casem por
 * construção. Estes testes são o que garante isso: sem eles, alguém acrescenta um componente
 * em um lado, esquece o outro, e a divergência só aparece como `unknown-component` na hora do
 * import — longe de quem pode corrigir.
 */
describe('gerador de kit do Figma', () => {
  it('só cria componentes que o contrato conhece', () => {
    for (const name of KIT_COMPONENT_NAMES) {
      expect(isKnownComponent(name), `'${name}' não está no kit v1`).toBe(true)
    }
  })

  it('cobre todo o kit v1, menos o Screen', () => {
    // `Screen` na Unity é o prefab de Canvas para teste isolado; no Figma o equivalente é a
    // convenção de nome do frame, entregue como template em vez de componente.
    const expected = KIT_V1.filter((name) => name !== 'Screen')

    expect([...KIT_COMPONENT_NAMES].sort()).toEqual([...expected].sort())
  })

  it('não tem nome repetido', () => {
    expect(new Set(KIT_COMPONENT_NAMES).size).toBe(KIT_COMPONENT_NAMES.length)
  })

  it('gera nomes que sobrevivem à normalização do exportador', () => {
    // Se o nome do componente criado não normalizar para ele mesmo, a instância dele não
    // resolveria no import — o gerador estaria criando o próprio problema que evita.
    for (const name of KIT_COMPONENT_NAMES) {
      expect(normalizeCanonicalName(name)).toBe(name)
    }
  })

  it('o template de tela passa na regra de frame raiz do exportador', () => {
    // O designer duplica este frame e exporta. Se o nome não casar com a regra, o primeiro
    // export dele falharia com root-frame-name.
    expect(parseScreenName(SCREEN_TEMPLATE_NAME)).toBe('Exemplo')
  })
})
