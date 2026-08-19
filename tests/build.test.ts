import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { beforeEach, describe, expect, it } from 'vitest'
import { RULES } from '../src/diagnostics'
import { build } from '../src/traverse'
import type { IRNode, UIIR } from '../src/uiir'
import {
  dropShadow,
  frame,
  gradientPaint,
  group,
  imagePaint,
  installFigmaGlobal,
  instance,
  rectangle,
  resetIds,
  solidPaint,
  text,
  vector,
} from './figma-mock'

const schema = JSON.parse(
  readFileSync(new URL('../schema/uiir.schema.json', import.meta.url), 'utf8'),
) as object

const ajv = new (Ajv2020 as unknown as typeof import('ajv/dist/2020.js').default)({
  allErrors: true,
  strict: false,
})
addFormats(ajv as never)
const validate = ajv.compile(schema)

const options = { exportAssets: false, assetScale: 2 } as const

function expectSchemaValid(ir: UIIR | null): void {
  expect(ir).not.toBeNull()
  const valid = validate(ir)
  if (!valid) {
    throw new Error(
      `IR invalido contra o schema:\n${(validate.errors ?? [])
        .map((error) => `  ${error.instancePath} ${error.message}`)
        .join('\n')}`,
    )
  }
}

function findByName(node: IRNode, name: string): IRNode | null {
  if (node.name === name) return node
  for (const child of node.children ?? []) {
    const found = findByName(child, name)
    if (found !== null) return found
  }
  return null
}

function rules(diagnostics: readonly { rule: string }[]): string[] {
  return diagnostics.map((item) => item.rule)
}

beforeEach(() => {
  resetIds()
  installFigmaGlobal()
})

describe('validacao da raiz', () => {
  it('recusa selecao vazia', async () => {
    const result = await build([], options)
    expect(result.ir).toBeNull()
    expect(rules(result.bag.all)).toContain(RULES.emptySelection)
    expect(result.bag.hasErrors).toBe(true)
  })

  it('recusa selecao multipla', async () => {
    const result = await build([frame({ name: 'screen/A' }), frame({ name: 'screen/B' })], options)
    expect(result.ir).toBeNull()
    expect(rules(result.bag.all)).toContain(RULES.emptySelection)
  })

  it('recusa frame raiz fora do padrao', async () => {
    const result = await build([frame({ name: 'Home Menu' })], options)
    expect(result.ir).toBeNull()
    expect(rules(result.bag.all)).toContain(RULES.rootFrameName)
  })

  it('recusa raiz que nao e frame', async () => {
    const result = await build([text({ name: 'screen/HomeMenu' })], options)
    expect(result.ir).toBeNull()
    expect(rules(result.bag.all)).toContain(RULES.rootFrameName)
  })

  it('aceita frame raiz valido e usa o nome da tela', async () => {
    const result = await build(
      [frame({ name: 'screen/HomeMenu', width: 1080, height: 1920 })],
      options,
    )

    expect(result.screenName).toBe('HomeMenu')
    expect(result.ir?.root.name).toBe('HomeMenu')
    expect(result.ir?.canvas).toEqual({ width: 1080, height: 1920, orientation: 'portrait' })
    expect(result.bag.hasErrors).toBe(false)
    expectSchemaValid(result.ir)
  })

  it('marca landscape quando a tela e mais larga que alta', async () => {
    const result = await build(
      [frame({ name: 'screen/Hud', width: 1920, height: 1080 })],
      options,
    )
    expect(result.ir?.canvas.orientation).toBe('landscape')
  })

  it('avisa quando a tela esta vazia', async () => {
    const result = await build([frame({ name: 'screen/Vazia' })], options)
    expect(rules(result.bag.all)).toContain(RULES.emptyScreen)
  })
})

describe('convencoes de nome', () => {
  it('remove layers com prefixo _', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [frame({ name: '_notes' }), frame({ name: 'Header' })],
        }),
      ],
      options,
    )

    const children = result.ir!.root.children ?? []
    expect(children.map((child) => child.name)).toEqual(['Header'])
  })

  it('coleta binds e recusa duplicata', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [
            frame({ name: '@PlayButton' }),
            frame({ name: '@PlayButton' }),
            frame({ name: '@Coins' }),
          ],
        }),
      ],
      options,
    )

    expect(result.bindCount).toBe(2)
    expect(rules(result.bag.all)).toContain(RULES.duplicateBind)
    expect(result.bag.hasErrors).toBe(true)
  })

  it('recusa bind que nao e identificador', async () => {
    const result = await build(
      [frame({ name: 'screen/HomeMenu', children: [frame({ name: '@2 play' })] })],
      options,
    )

    expect(rules(result.bag.all)).toContain(RULES.invalidBind)
    expect(findByName(result.ir!.root, '2 play')?.bind).toBeUndefined()
  })

  it('achata layer marcada com #img e registra o asset', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [frame({ name: 'hero#img', width: 300, height: 200 })],
        }),
      ],
      options,
    )

    const hero = findByName(result.ir!.root, 'hero')
    expect(hero?.kind).toBe('image')
    expect(hero?.fill?.type).toBe('IMAGE')
    // PNG do tamanho exato da caixa: esticar preserva o desenho.
    expect(hero?.fill?.scaleMode).toBe('STRETCH')

    const asset = result.ir!.assets.find((item) => item.id === hero?.fill?.assetId)
    expect(asset).toBeDefined()
    expect(asset?.scale).toBe(2)
    expect(asset?.width).toBe(600)
    expect(asset?.height).toBe(400)
    expect(asset?.file).toMatch(/^images\/.+@2x\.png$/)
    expectSchemaValid(result.ir)
  })

  it('grava locKey em texto marcado', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [text({ name: 'title:loc.menu.title', characters: 'Menu' })],
        }),
      ],
      options,
    )

    expect(findByName(result.ir!.root, 'title')?.text?.locKey).toBe('loc.menu.title')
  })
})

describe('geometria', () => {
  it('calcula rect relativo ao pai', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          x: 500,
          y: 300,
          width: 1080,
          height: 1920,
          children: [frame({ name: 'Header', x: 40, y: 120, width: 1000, height: 200 })],
        }),
      ],
      options,
    )

    // A raiz zera a propria posicao na pagina.
    expect(result.ir!.root.rect).toEqual({ x: 0, y: 0, width: 1080, height: 1920 })
    expect(findByName(result.ir!.root, 'Header')!.rect).toEqual({
      x: 40,
      y: 120,
      width: 1000,
      height: 200,
    })
  })

  it('mantem rect relativo correto dentro de um group', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          x: 0,
          y: 0,
          children: [
            group({
              name: 'Grupo',
              x: 100,
              y: 100,
              width: 200,
              height: 200,
              children: [frame({ name: 'Dentro', x: 10, y: 20, width: 50, height: 50 })],
            }),
          ],
        }),
      ],
      options,
    )

    expect(findByName(result.ir!.root, 'Dentro')!.rect).toEqual({
      x: 10,
      y: 20,
      width: 50,
      height: 50,
    })
  })

  it('exporta cantos arredondados na ordem CSS de cantos', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [rectangle({ name: 'Card', cornerRadius: 12 })],
        }),
      ],
      options,
    )

    expect(findByName(result.ir!.root, 'Card')!.cornerRadius).toEqual([12, 12, 12, 12])
  })
})

describe('auto layout', () => {
  it('mapeia container com auto layout', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [
            frame({
              name: 'Botoes',
              layoutMode: 'VERTICAL',
              itemSpacing: 16,
              paddingTop: 8,
              paddingRight: 12,
              paddingBottom: 8,
              paddingLeft: 12,
              primaryAxisAlignItems: 'CENTER',
              counterAxisAlignItems: 'CENTER',
              layoutSizingHorizontal: 'FILL',
              layoutSizingVertical: 'HUG',
              children: [frame({ name: 'Item', layoutSizingHorizontal: 'FILL', layoutGrow: 1 })],
            }),
          ],
        }),
      ],
      options,
    )

    const container = findByName(result.ir!.root, 'Botoes')!
    expect(container.layout).toEqual({
      mode: 'VERTICAL',
      padding: [8, 12, 8, 12],
      spacing: 16,
      primaryAlign: 'CENTER',
      counterAlign: 'CENTER',
      sizing: { horizontal: 'FILL', vertical: 'HUG' },
    })

    // Filho de container com layout carrega layoutChild e NAO carrega constraints:
    // quem posiciona e o LayoutGroup.
    const item = findByName(result.ir!.root, 'Item')!
    expect(item.layoutChild).toEqual({ sizing: { horizontal: 'FILL', vertical: 'FIXED' }, grow: 1 })
    expect(item.constraints).toBeUndefined()
  })

  it('emite constraints quando o pai nao tem layout', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [
            frame({ name: 'Fundo', constraints: { horizontal: 'STRETCH', vertical: 'STRETCH' } }),
          ],
        }),
      ],
      options,
    )

    const fundo = findByName(result.ir!.root, 'Fundo')!
    expect(fundo.constraints).toEqual({ horizontal: 'STRETCH', vertical: 'STRETCH' })
    expect(fundo.layoutChild).toBeUndefined()
  })

  it('avisa sobre space-between e wrap', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [
            frame({
              name: 'Linha',
              layoutMode: 'HORIZONTAL',
              layoutWrap: 'WRAP',
              primaryAxisAlignItems: 'SPACE_BETWEEN',
            }),
          ],
        }),
      ],
      options,
    )

    const found = rules(result.bag.all)
    expect(found).toContain(RULES.spaceBetween)
    expect(found).toContain(RULES.layoutWrap)
    expect(findByName(result.ir!.root, 'Linha')!.layout?.mode).toBe('WRAP')
  })
})

describe('componentes', () => {
  it('resolve nome canonico pelo ComponentSet e extrai propriedades', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [
            instance({
              name: 'Botao jogar',
              setName: 'Button/Primary',
              properties: {
                'label#1:2': { value: 'Jogar', type: 'TEXT' },
                State: { value: 'Default', type: 'VARIANT' },
              },
            }),
          ],
        }),
      ],
      options,
    )

    const node = findByName(result.ir!.root, 'Botao jogar')!
    expect(node.kind).toBe('instance')
    expect(node.component?.canonicalName).toBe('Button/Primary')
    expect(node.component?.setKey).toBe('setkey123')
    // O sufixo interno do Figma (`#1:2`) sai da chave.
    expect(node.component?.properties).toEqual({ label: 'Jogar', State: 'Default' })
    expect(result.componentCount).toBe(1)
    expectSchemaValid(result.ir)
  })

  it('normaliza espaco em volta da barra', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [instance({ name: 'Botao', setName: 'Button / Secondary' })],
        }),
      ],
      options,
    )

    expect(findByName(result.ir!.root, 'Botao')!.component?.canonicalName).toBe('Button/Secondary')
  })

  it('deriva o label do texto interno quando nao ha propriedade', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [
            instance({
              name: 'Botao',
              setName: 'Button/Primary',
              children: [text({ name: 'Label', characters: 'Continuar' })],
            }),
          ],
        }),
      ],
      options,
    )

    expect(findByName(result.ir!.root, 'Botao')!.component?.properties).toEqual({
      label: 'Continuar',
    })
  })

  it('nao entra nos filhos de uma instancia', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [
            instance({
              name: 'Botao',
              setName: 'Button/Primary',
              children: [text({ name: 'Label', characters: 'Jogar' })],
            }),
          ],
        }),
      ],
      options,
    )

    // O interior do botao pertence ao prefab do kit, nao ao export.
    expect(findByName(result.ir!.root, 'Botao')!.children).toBeUndefined()
    expect(findByName(result.ir!.root, 'Label')).toBeNull()
  })

  it('avisa quando o componente nao esta no kit', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [instance({ name: 'Estranho', setName: 'Widget/Fancy' })],
        }),
      ],
      options,
    )

    expect(rules(result.bag.all)).toContain(RULES.unknownComponent)
    // Mesmo desconhecido, segue como instancia: o importador decide o fallback.
    expect(findByName(result.ir!.root, 'Estranho')!.kind).toBe('instance')
  })

  it('degrada para frame quando a instancia nao resolve', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [instance({ name: 'Orfa', mainMissing: true })],
        }),
      ],
      options,
    )

    const node = findByName(result.ir!.root, 'Orfa')!
    expect(node.kind).toBe('frame')
    expect(node.component).toBeUndefined()
    expect(rules(result.bag.all)).toContain(RULES.unknownComponent)
    expectSchemaValid(result.ir)
  })

  it('avisa sobre frame com nome de componente do kit', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [frame({ name: 'Button/Primary' })],
        }),
      ],
      options,
    )

    expect(rules(result.bag.all)).toContain(RULES.detachedInstance)
  })
})

describe('fills e efeitos', () => {
  it('exporta fill solido em hex', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [rectangle({ name: 'Fundo', fills: [solidPaint(1, 0.4, 0)] })],
        }),
      ],
      options,
    )

    expect(findByName(result.ir!.root, 'Fundo')!.fill).toEqual({
      type: 'SOLID',
      color: '#ff6600',
    })
  })

  it('inclui alpha quando o fill nao e opaco', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [rectangle({ name: 'Veu', fills: [solidPaint(0, 0, 0, 0.5)] })],
        }),
      ],
      options,
    )

    expect(findByName(result.ir!.root, 'Veu')!.fill?.color).toBe('#00000080')
  })

  it('aproxima gradiente por cor chapada e avisa', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [rectangle({ name: 'Ceu', fills: [gradientPaint()] })],
        }),
      ],
      options,
    )

    const node = findByName(result.ir!.root, 'Ceu')!
    expect(node.fill?.type).toBe('SOLID')
    expect(node.fill?.color).toBe('#ff0000')
    expect(rules(result.bag.all)).toContain(RULES.unsupportedEffect)
  })

  it('avisa sobre sombra e nao a exporta', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [rectangle({ name: 'Card', effects: [dropShadow()] })],
        }),
      ],
      options,
    )

    expect(rules(result.bag.all)).toContain(RULES.unsupportedEffect)
  })

  it('trata node com fill de imagem como image', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [rectangle({ name: 'Foto', fills: [imagePaint('FILL')] })],
        }),
      ],
      options,
    )

    const node = findByName(result.ir!.root, 'Foto')!
    expect(node.kind).toBe('image')
    expect(node.fill?.scaleMode).toBe('FILL')
  })

  it('rasteriza vetor automaticamente e avisa', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [vector({ name: 'Estrela' })],
        }),
      ],
      options,
    )

    expect(findByName(result.ir!.root, 'Estrela')!.kind).toBe('image')
    expect(rules(result.bag.all)).toContain(RULES.complexVector)
  })

  it('avisa quando ha mais de um fill e usa o de cima', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [
            rectangle({ name: 'Empilhado', fills: [solidPaint(0, 0, 0), solidPaint(1, 1, 1)] }),
          ],
        }),
      ],
      options,
    )

    expect(rules(result.bag.all)).toContain(RULES.multipleFills)
    expect(findByName(result.ir!.root, 'Empilhado')!.fill?.color).toBe('#ffffff')
  })
})

describe('texto', () => {
  it('mapeia os campos de texto', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [
            text({
              name: 'Titulo',
              characters: 'Bem-vindo',
              fontFamily: 'Nunito',
              fontStyle: 'Bold',
              fontSize: 48,
              lineHeight: { unit: 'PIXELS', value: 56 },
              letterSpacing: { unit: 'PERCENT', value: 2 },
              textAlignHorizontal: 'CENTER',
              textAlignVertical: 'TOP',
              textAutoResize: 'HEIGHT',
              textTruncation: 'ENDING',
              maxLines: 2,
              fills: [solidPaint(1, 1, 1)],
            }),
          ],
        }),
      ],
      options,
    )

    expect(findByName(result.ir!.root, 'Titulo')!.text).toEqual({
      characters: 'Bem-vindo',
      font: { family: 'Nunito', style: 'Bold' },
      size: 48,
      lineHeight: { unit: 'PIXELS', value: 56 },
      letterSpacing: { unit: 'PERCENT', value: 2 },
      alignHorizontal: 'CENTER',
      alignVertical: 'TOP',
      autoResize: 'HEIGHT',
      color: '#ffffff',
      maxLines: 2,
      truncation: 'ELLIPSIS',
    })
  })

  it('avisa quando o texto tem formatacao mista', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [text({ name: 'Misto', segments: 3 })],
        }),
      ],
      options,
    )

    expect(rules(result.bag.all)).toContain(RULES.mixedTextStyles)
  })

  it('converte small caps em maiuscula com aviso', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [text({ name: 'Caps', textCase: 'SMALL_CAPS' })],
        }),
      ],
      options,
    )

    expect(findByName(result.ir!.root, 'Caps')!.text?.case).toBe('UPPER')
    expect(rules(result.bag.all)).toContain(RULES.unsupportedTextCase)
  })
})

describe('tokens', () => {
  it('resolve estilo de cor e de texto em token', async () => {
    installFigmaGlobal({
      styles: { 'S:color1': 'color/primary', 'S:text1': 'text/h1' },
    })

    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [
            rectangle({ name: 'Fundo', fills: [solidPaint(1, 0.4, 0)], fillStyleId: 'S:color1' }),
            text({ name: 'Titulo', textStyleId: 'S:text1', fontSize: 48 }),
          ],
        }),
      ],
      options,
    )

    expect(findByName(result.ir!.root, 'Fundo')!.fill?.token).toBe('color.primary')
    expect(findByName(result.ir!.root, 'Titulo')!.text?.token).toBe('text.h1')
    expect(result.ir!.tokens?.colors).toEqual({ 'color.primary': '#ff6600' })
    expect(result.ir!.tokens?.typography?.['text.h1']?.size).toBe(48)
    expectSchemaValid(result.ir)
  })

  it('avisa quando cor e tipografia estao fora de token', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [
            rectangle({ name: 'Fundo', fills: [solidPaint(1, 0, 0)] }),
            text({ name: 'Titulo' }),
          ],
        }),
      ],
      options,
    )

    const found = rules(result.bag.all)
    expect(found).toContain(RULES.hardcodedColor)
    expect(found).toContain(RULES.hardcodedTypography)
  })
})

describe('export do pacote', () => {
  it('rasteriza os assets quando exportAssets esta ligado', async () => {
    const result = await build(
      [
        frame({
          name: 'screen/HomeMenu',
          children: [frame({ name: 'hero#img', width: 100, height: 50 })],
        }),
      ],
      { exportAssets: true, assetScale: 2 },
    )

    expect(result.assets).toHaveLength(1)
    expect(result.assets[0]!.path).toMatch(/^images\/.+@2x\.png$/)
    expect(result.assets[0]!.bytes.length).toBeGreaterThan(0)
    // Todo asset do zip precisa ter entrada correspondente no IR.
    expect(result.ir!.assets.map((asset) => asset.file)).toEqual(
      result.assets.map((asset) => asset.path),
    )
  })

  it('produz IR valido contra o schema numa tela realista', async () => {
    installFigmaGlobal({ styles: { 'S:c': 'color/bg', 'S:t': 'text/h1' } })

    const screen = frame({
      name: 'screen/HomeMenu',
      width: 1080,
      height: 1920,
      children: [
        rectangle({
          name: 'Fundo',
          fills: [solidPaint(0.1, 0.1, 0.15)],
          fillStyleId: 'S:c',
          constraints: { horizontal: 'STRETCH', vertical: 'STRETCH' },
          width: 1080,
          height: 1920,
        }),
        frame({ name: 'logo#img', x: 340, y: 200, width: 400, height: 160 }),
        frame({
          name: 'Menu',
          x: 140,
          y: 700,
          width: 800,
          height: 400,
          layoutMode: 'VERTICAL',
          itemSpacing: 24,
          paddingTop: 32,
          paddingRight: 32,
          paddingBottom: 32,
          paddingLeft: 32,
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
          layoutSizingVertical: 'HUG',
          cornerRadius: 24,
          fills: [solidPaint(0.2, 0.2, 0.25)],
          children: [
            text({
              name: '@TitleLabel:loc.menu.title',
              characters: 'Menu Principal',
              textStyleId: 'S:t',
              layoutSizingHorizontal: 'FILL',
            }),
            instance({
              name: '@PlayButton',
              setName: 'Button/Primary',
              layoutSizingHorizontal: 'FILL',
              properties: { 'label#1:9': { value: 'Jogar', type: 'TEXT' } },
            }),
            instance({
              name: '@SettingsButton',
              setName: 'Button/Secondary',
              layoutSizingHorizontal: 'FILL',
              properties: { 'label#1:10': { value: 'Opcoes', type: 'TEXT' } },
            }),
          ],
        }),
        group({
          name: 'Hud',
          x: 0,
          y: 0,
          width: 1080,
          height: 120,
          children: [
            instance({ name: 'Barra', setName: 'ProgressBar', x: 40, y: 40, width: 300 }),
            text({ name: '@CoinLabel', characters: '1200', x: 900, y: 40 }),
          ],
        }),
      ],
    })

    const result = await build([screen], options)

    expectSchemaValid(result.ir)
    expect(result.bag.hasErrors).toBe(false)
    expect(result.bindCount).toBe(4)
    expect(result.componentCount).toBe(3)
    expect(result.ir!.assets).toHaveLength(1)
    expect(result.ir!.lint).toEqual(result.bag.sorted())
  })
})
