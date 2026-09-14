import { describe, expect, it } from 'vitest'
import { KIT_BUILDERS, KIT_COMPONENT_NAMES, SCREEN_TEMPLATE_NAME } from '../src/kit-builder'
import {
  CUSTOM_ROLES,
  isCustomRole,
  isKnownComponent,
  KIT_CATALOG,
  KIT_V1,
  ROLE_LABELS,
} from '../src/kit'
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

  it('todo nome do catálogo tem um construtor, e todo construtor está no catálogo', () => {
    // O catálogo é o que a UI do plugin lista para o designer; os construtores são o que o
    // botão realmente cria. Divergir aqui significa oferecer um componente que não nasce, ou
    // ter um componente que ninguém consegue pedir.
    const catalog = KIT_CATALOG.flatMap((section) => [...section.items]).sort()
    const builders = Object.keys(KIT_BUILDERS).sort()

    expect(builders).toEqual(catalog)
  })

  it('o catálogo não repete nome entre seções', () => {
    const all = KIT_CATALOG.flatMap((section) => [...section.items])
    expect(new Set(all).size).toBe(all.length)
  })

  it('o template de tela passa na regra de frame raiz do exportador', () => {
    // O designer duplica este frame e exporta. Se o nome não casar com a regra, o primeiro
    // export dele falharia com root-frame-name.
    expect(parseScreenName(SCREEN_TEMPLATE_NAME)).toBe('Exemplo')
  })
})

describe('componente customizado', () => {
  it('todo papel tem rótulo para o designer', () => {
    for (const role of CUSTOM_ROLES) {
      expect(ROLE_LABELS[role], `'${role}' está sem rótulo`).toBeTruthy()
    }

    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...CUSTOM_ROLES].sort())
  })

  it('isCustomRole aceita só os papéis conhecidos', () => {
    for (const role of CUSTOM_ROLES) {
      expect(isCustomRole(role)).toBe(true)
    }

    // O valor vem da UI, que é outro contexto de execução: o sandbox não pode confiar nele.
    expect(isCustomRole('button; drop table')).toBe(false)
    expect(isCustomRole('')).toBe(false)
    expect(isCustomRole('Button')).toBe(false)
  })

  it('o nome do componente customizado sobrevive à normalização do exportador', () => {
    // Mesma garantia que o kit canônico tem: se o nome não normaliza para ele mesmo, a
    // instância não resolveria no import.
    expect(normalizeCanonicalName('HUD/StatBar')).toBe('HUD/StatBar')
    expect(normalizeCanonicalName('item slot')).toBe('ItemSlot')
    expect(normalizeCanonicalName('  card  ')).toBe('Card')
    expect(normalizeCanonicalName('///')).toBeNull()
    expect(normalizeCanonicalName('9Lives')).toBeNull()
  })
})
