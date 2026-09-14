import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { beforeEach, describe, expect, it } from 'vitest'
import { RULES } from '../src/diagnostics'
import { buildComponent } from '../src/traverse'
import type { UIIR } from '../src/uiir'
import {
  component,
  componentSet,
  frame,
  installFigmaGlobal,
  rectangle,
  resetIds,
  text,
  withPropertyReference,
} from './figma-mock'

/**
 * Export de componente: o caminho que faz um botao desenhado no Figma virar um prefab de kit
 * de verdade na Unity, em vez de um placeholder cinza.
 */

const schema = JSON.parse(
  readFileSync(new URL('../schema/uiir.schema.json', import.meta.url), 'utf8'),
) as object

const ajv = new (Ajv2020 as unknown as typeof import('ajv/dist/2020.js').default)({
  allErrors: true,
  strict: false,
})
addFormats(ajv as never)
const validate = ajv.compile(schema)

const options = { exportAssets: false, assetScale: 2, deriveSlices: true } as const

function expectSchemaValid(ir: UIIR | null): void {
  expect(ir).not.toBeNull()
  if (!validate(ir)) {
    throw new Error(
      `IR invalido contra o schema:\n${(validate.errors ?? [])
        .map((error) => `  ${error.instancePath} ${error.message}`)
        .join('\n')}`,
    )
  }
}

function rules(diagnostics: readonly { rule: string }[]): string[] {
  return diagnostics.map((item) => item.rule)
}

/** Botao com fundo achatado e um label marcado como slot. */
function button(name = 'Button/Primary'): SceneNode {
  return component({
    name,
    width: 320,
    height: 96,
    cornerRadius: 20,
    children: [
      frame({ name: 'bg#img', width: 320, height: 96, cornerRadius: 20 }),
      text({ name: '$label', characters: 'Jogar', x: 40, y: 30 }),
    ],
  })
}

beforeEach(() => {
  resetIds()
  installFigmaGlobal()
})

describe('validacao da selecao', () => {
  it('recusa selecao vazia', async () => {
    const result = await buildComponent([], options)
    expect(result.ir).toBeNull()
    expect(rules(result.bag.all)).toContain(RULES.emptySelection)
  })

  it('recusa selecao multipla', async () => {
    const result = await buildComponent([button('Button/Primary'), button('Button/Icon')], options)
    expect(result.ir).toBeNull()
    expect(rules(result.bag.all)).toContain(RULES.emptySelection)
  })

  it('recusa frame comum: precisa ser um Component', async () => {
    // O caso mais provavel de acontecer de verdade — o designer desenha o botao e esquece de
    // transformar em componente.
    const result = await buildComponent([frame({ name: 'Button/Primary' })], options)

    expect(result.ir).toBeNull()
    expect(rules(result.bag.all)).toContain(RULES.componentRoot)
    expect(result.bag.hasErrors).toBe(true)
  })

  it('recusa nome que nao vira nome canonico', async () => {
    const result = await buildComponent([component({ name: '///' })], options)
    expect(result.ir).toBeNull()
    expect(rules(result.bag.all)).toContain(RULES.componentRoot)
  })
})

describe('cabecalho do kit', () => {
  it('exporta nome canonico, papel e tamanho de design', async () => {
    const result = await buildComponent([button()], options)

    expectSchemaValid(result.ir)
    expect(result.canonicalName).toBe('Button/Primary')
    expect(result.ir!.kit!.canonicalName).toBe('Button/Primary')
    expect(result.ir!.kit!.role).toBe('button')
    expect(result.ir!.canvas).toEqual({ width: 320, height: 96 })
    expect(result.bag.hasErrors).toBe(false)
  })

  it('infere o papel pela familia do nome', async () => {
    const cases: Array<[string, string]> = [
      ['Button/Secondary', 'button'],
      ['Toggle/Checkbox', 'toggle'],
      ['Icon', 'icon'],
      ['Panel', 'container'],
      ['Window/Modal', 'container'],
      // Nome que nao diz nada cai no papel que nao promete comportamento.
      ['HUD/StatBar', 'display'],
    ]

    for (const [name, role] of cases) {
      const result = await buildComponent([button(name)], options)
      expect(result.ir!.kit!.role, `'${name}' deveria inferir '${role}'`).toBe(role)
    }
  })

  it('o papel escolhido pelo designer ganha do palpite pelo nome', async () => {
    const result = await buildComponent([button('HUD/StatBar')], { ...options, role: 'button' })
    expect(result.ir!.kit!.role).toBe('button')
  })

  it('a raiz usa o nome canonico, nao o nome da variante', async () => {
    const result = await buildComponent([button()], options)
    expect(result.ir!.root.name).toBe('Button_Primary')
  })
})

describe('slots', () => {
  it('descobre slot pelo prefixo $ no nome da layer', async () => {
    const result = await buildComponent([button()], options)

    expect(result.ir!.kit!.slots).toHaveLength(1)
    expect(result.ir!.kit!.slots[0]!.name).toBe('label')
    expect(result.ir!.kit!.slots[0]!.nodeId).toBeTruthy()
    expect(result.slotCount).toBe(1)
  })

  it('descobre slot pela propriedade de componente do Figma', async () => {
    const label = withPropertyReference(
      text({ name: 'Label', characters: 'Jogar' }),
      'characters',
      'label',
    )

    const node = component({
      name: 'Button/Primary',
      width: 320,
      height: 96,
      children: [label],
    })

    const result = await buildComponent([node], options)

    expect(result.ir!.kit!.slots.map((slot) => slot.name)).toEqual(['label'])
  })

  it('avisa quando o componente nao declara slot nenhum', async () => {
    const node = component({
      name: 'Panel',
      width: 200,
      height: 100,
      children: [rectangle({ name: 'bg', width: 200, height: 100 })],
    })

    const result = await buildComponent([node], options)

    expect(rules(result.bag.all)).toContain(RULES.noSlots)
    // Aviso, nao erro: o componente ainda e util, so nao recebe conteudo.
    expect(result.bag.hasErrors).toBe(false)
  })

  it('slot repetido vale o primeiro e avisa', async () => {
    const node = component({
      name: 'Button/Primary',
      width: 320,
      height: 96,
      children: [
        text({ name: '$label', characters: 'A', x: 0, y: 0 }),
        text({ name: '$label', characters: 'B', x: 0, y: 40 }),
      ],
    })

    const result = await buildComponent([node], options)

    expect(result.ir!.kit!.slots).toHaveLength(1)
    expect(rules(result.bag.all)).toContain(RULES.duplicateSlot)
  })
})

describe('variantes', () => {
  it('exporta a variante Default e registra as ignoradas', async () => {
    const states = ['Hover', 'State=Default', 'State=Pressed', 'State=Disabled']

    const set = componentSet({
      name: 'Button/Primary',
      width: 320,
      height: 96,
      children: states.map((state) =>
        component({
          name: state,
          width: 320,
          height: 96,
          children: [text({ name: '$label', characters: 'Jogar', x: 40, y: 30 })],
        }),
      ),
    })

    const result = await buildComponent([set], options)

    expectSchemaValid(result.ir)
    expect(result.ir!.kit!.canonicalName).toBe('Button/Primary')
    // Trava a variante de origem: exportar de outra depois trocaria todos os node ids de
    // uma vez e o importador recriaria o prefab inteiro.
    expect(result.ir!.kit!.sourceVariantId).toBeTruthy()
    expect(result.ir!.kit!.ignoredVariants).toHaveLength(3)
    expect(rules(result.bag.all)).toContain(RULES.variantIgnored)
  })

  it('sem variante Default, usa a primeira', async () => {
    const set = componentSet({
      name: 'Button/Primary',
      width: 320,
      height: 96,
      children: [
        component({
          name: 'State=Pressed',
          width: 320,
          height: 96,
          children: [text({ name: '$label', characters: 'Jogar', x: 0, y: 0 })],
        }),
      ],
    })

    const result = await buildComponent([set], options)

    expect(result.ir).not.toBeNull()
    expect(result.ir!.kit!.ignoredVariants).toBeUndefined()
  })
})

describe('assets do componente', () => {
  it('nomeia o asset pela spec de entrega de arte, nao pelo node id', async () => {
    const result = await buildComponent([button()], options)

    const asset = result.ir!.assets[0]!
    // `<componente>_<parte>_<estado>` — nome que o artista consegue ler e localizar, em vez
    // do esquema com sufixo de node id que a reconciliacao de tela usa.
    expect(asset.id).toBe('button-primary_bg_default')
    expect(asset.file).toBe('images/button-primary_bg_default@2x.png')
  })

  it('deriva a borda de 9-slice do raio, para o fundo nao distorcer ao esticar', async () => {
    const result = await buildComponent([button()], options)

    expect(result.ir!.assets[0]!.nineSlice).toEqual([20, 20, 20, 20])
  })

  it('desempata nome de asset repetido sem perder legibilidade', async () => {
    const node = component({
      name: 'Button/Primary',
      width: 320,
      height: 96,
      children: [
        frame({ name: 'bg#img', width: 100, height: 40, x: 0, y: 0 }),
        frame({ name: 'bg#img', width: 100, height: 40, x: 0, y: 48 }),
      ],
    })

    const result = await buildComponent([node], options)

    expect(result.ir!.assets.map((asset) => asset.id)).toEqual([
      'button-primary_bg_default',
      'button-primary_bg_default-2',
    ])
  })
})
