import { describe, expect, it } from 'vitest'
import { assetPath, buildKitBatchManifest, componentPath, slugFor } from '../src/kit-batch'

/**
 * O leitor do lado da Unity é escrito em paralelo contra este formato exato — por isso o que
 * importa testar aqui é a forma do manifesto e a regra de path, não o conteúdo de cada
 * `component.json` (isso já é coberto pelos testes de `traverse.ts`).
 */
describe('slugFor / componentPath / assetPath', () => {
  it('slug troca "/" por "_", igual ao nome de arquivo do .uicomponent avulso', () => {
    expect(slugFor('Button/Primary')).toBe('Button_Primary')
    expect(slugFor('HUD/StatBar')).toBe('HUD_StatBar')
    expect(slugFor('Panel')).toBe('Panel')
  })

  it('componentPath sempre cai em components/<slug>/component.json', () => {
    expect(componentPath('Button/Primary')).toBe('components/Button_Primary/component.json')
    expect(componentPath('Panel')).toBe('components/Panel/component.json')
  })

  it('assetPath aninha o path de asset do .uicomponent avulso um nível a mais', () => {
    expect(assetPath('Button/Primary', 'images/bg_default.png')).toBe(
      'components/Button_Primary/images/bg_default.png',
    )
  })
})

describe('buildKitBatchManifest', () => {
  const source = { fileKey: 'FILEKEY123', fileName: 'Jogo Teste', pageName: 'UI Kit' }

  it('monta um component entry por componente, com o path derivado do nome canônico', () => {
    const manifest = buildKitBatchManifest(
      source,
      '1.1.0',
      '0.1.0',
      '2026-09-15T00:00:00.000Z',
      [{ canonicalName: 'Button/Primary' }, { canonicalName: 'Panel' }],
      [],
    )

    expect(manifest).toEqual({
      schemaVersion: '1.1.0',
      pluginVersion: '0.1.0',
      generatedAt: '2026-09-15T00:00:00.000Z',
      source,
      components: [
        { canonicalName: 'Button/Primary', path: 'components/Button_Primary/component.json' },
        { canonicalName: 'Panel', path: 'components/Panel/component.json' },
      ],
      skipped: [],
    })
  })

  it('carrega skipped[] sem mexer no conteúdo', () => {
    const skipped = [{ name: 'Frame solto', reason: 'não é um componente' }]
    const manifest = buildKitBatchManifest(source, '1.1.0', '0.1.0', 'now', [], skipped)

    expect(manifest.skipped).toEqual(skipped)
    // Devolve uma cópia, não a mesma referência: mutar o array do chamador depois de montar
    // o manifesto não pode vazar para dentro dele.
    expect(manifest.skipped).not.toBe(skipped)
  })

  it('não produz path duplicado para nomes canônicos diferentes', () => {
    const manifest = buildKitBatchManifest(
      source,
      '1.1.0',
      '0.1.0',
      'now',
      [{ canonicalName: 'Button/Primary' }, { canonicalName: 'Button/Secondary' }],
      [],
    )

    const paths = manifest.components.map((entry) => entry.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
})
