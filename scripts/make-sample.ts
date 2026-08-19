/**
 * Gera samples/HomeMenu.uiexport sem precisar do Figma.
 *
 * Serve para dois propositos:
 *  - o importador da Unity pode ser desenvolvido e testado antes de existir um arquivo
 *    real do Figma, e sem depender de ninguem exportar nada;
 *  - o pacote commitado e o golden file dos testes de import.
 *
 * Roda via `npm run sample`. Reaproveita o mock dos testes de proposito: se o mock
 * divergir da API real do Figma, o sample divergiria junto — e e exatamente esse mock
 * que os 69 testes exercitam.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { readFileSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'
import { build } from '../src/traverse'
import {
  frame,
  group,
  installFigmaGlobal,
  instance,
  rectangle,
  solidPaint,
  text,
} from '../tests/figma-mock'

const here = dirname(fileURLToPath(import.meta.url))
const schemaPath = new URL('../schema/uiir.schema.json', import.meta.url)
/**
 * Destinos do sample.
 *
 * O repo do plugin sempre recebe a sua propria copia, entao `npm run sample` funciona num
 * clone isolado. Os outros dois repos so sao escritos quando estao clonados como irmaos, e
 * o que foi pulado aparece no log — um sample regenerado sem atualizar os irmaos deixaria o
 * golden file da Unity validando um formato que ja nao existe.
 */
const SIBLING_TARGETS = [
  { repo: 'ui-exporter-tool-unity-package', file: 'Samples~/HomeMenu.uiexport' },
  { repo: 'ui-exporter-tool-docs-and-samples', file: 'samples/HomeMenu.uiexport' },
] as const

const localTarget = `${here}/../samples/HomeMenu.uiexport`

/** Fixo para o pacote ser byte-a-byte reproduzivel: ele e golden file dos testes. */
const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z'

// ---------------------------------------------------------------- PNG mínimo

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([...type].map((char) => char.charCodeAt(0)))
  const length = new Uint8Array(4)
  new DataView(length.buffer).setUint32(0, data.length)
  const crc = new Uint8Array(4)
  new DataView(crc.buffer).setUint32(0, crc32(concat(typeBytes, data)))
  return concat(length, typeBytes, data, crc)
}

/** PNG RGBA de cor unica. Placeholder honesto: nao finge ser arte. */
function makePng(width: number, height: number, rgba: [number, number, number, number]): Uint8Array {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdrData = new Uint8Array(13)
  const view = new DataView(ihdrData.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 6 // color type RGBA
  ihdrData[10] = 0 // deflate
  ihdrData[11] = 0 // filtro adaptativo
  ihdrData[12] = 0 // sem interlace

  const raw = new Uint8Array(height * (1 + width * 4))
  let p = 0
  for (let y = 0; y < height; y++) {
    raw[p++] = 0 // filtro None por scanline
    for (let x = 0; x < width; x++) {
      raw[p++] = rgba[0]
      raw[p++] = rgba[1]
      raw[p++] = rgba[2]
      raw[p++] = rgba[3]
    }
  }

  return concat(
    signature,
    chunk('IHDR', ihdrData),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  )
}

// ---------------------------------------------------------------- a tela

installFigmaGlobal({
  fileName: 'Arvore UI Kit — Sample',
  pageName: 'Telas',
  fileKey: 'SAMPLEFILEKEY',
  styles: {
    'S:bg': 'color/background',
    'S:panel': 'color/surface',
    'S:h1': 'text/h1',
    'S:body': 'text/body',
  },
})

const screen = frame({
  id: '0:1',
  name: 'screen/HomeMenu',
  width: 1080,
  height: 1920,
  children: [
    rectangle({
      id: '1:10',
      name: 'Background',
      x: 0,
      y: 0,
      width: 1080,
      height: 1920,
      fills: [solidPaint(0.07, 0.08, 0.12)],
      fillStyleId: 'S:bg',
      constraints: { horizontal: 'STRETCH', vertical: 'STRETCH' },
    }),
    frame({
      id: '1:20',
      name: 'logo#img',
      x: 340,
      y: 220,
      width: 400,
      height: 160,
      constraints: { horizontal: 'CENTER', vertical: 'MIN' },
    }),
    frame({
      id: '1:30',
      name: 'Menu',
      x: 140,
      y: 620,
      width: 800,
      height: 520,
      layoutMode: 'VERTICAL',
      itemSpacing: 24,
      paddingTop: 40,
      paddingRight: 40,
      paddingBottom: 40,
      paddingLeft: 40,
      primaryAxisAlignItems: 'CENTER',
      counterAxisAlignItems: 'CENTER',
      layoutSizingVertical: 'HUG',
      cornerRadius: 32,
      fills: [solidPaint(0.13, 0.14, 0.2)],
      fillStyleId: 'S:panel',
      constraints: { horizontal: 'CENTER', vertical: 'CENTER' },
      children: [
        text({
          id: '1:31',
          name: '@TitleLabel:loc.menu.title',
          characters: 'Menu Principal',
          fontFamily: 'Nunito',
          fontStyle: 'Bold',
          fontSize: 56,
          lineHeight: { unit: 'PIXELS', value: 64 },
          textAlignHorizontal: 'CENTER',
          textStyleId: 'S:h1',
          layoutSizingHorizontal: 'FILL',
          height: 64,
        }),
        instance({
          id: '1:32',
          name: '@PlayButton',
          setName: 'Button/Primary',
          key: 'btn-primary-key',
          layoutSizingHorizontal: 'FILL',
          height: 96,
          properties: {
            'label#1:1': { value: 'Jogar', type: 'TEXT' },
            State: { value: 'Default', type: 'VARIANT' },
            Size: { value: 'L', type: 'VARIANT' },
          },
        }),
        instance({
          id: '1:33',
          name: '@SettingsButton',
          setName: 'Button/Secondary',
          key: 'btn-secondary-key',
          layoutSizingHorizontal: 'FILL',
          height: 96,
          properties: {
            'label#1:2': { value: 'Configuracoes', type: 'TEXT' },
            State: { value: 'Default', type: 'VARIANT' },
          },
        }),
        instance({
          id: '1:34',
          name: '@QuitButton',
          setName: 'Button/Secondary',
          key: 'btn-secondary-key',
          layoutSizingHorizontal: 'FILL',
          height: 96,
          properties: {
            'label#1:3': { value: 'Sair', type: 'TEXT' },
            State: { value: 'Default', type: 'VARIANT' },
          },
        }),
      ],
    }),
    group({
      id: '1:40',
      name: 'Hud',
      x: 0,
      y: 0,
      width: 1080,
      height: 140,
      children: [
        instance({
          id: '1:41',
          name: '@XpBar',
          setName: 'ProgressBar',
          key: 'progressbar-key',
          x: 48,
          y: 48,
          width: 400,
          height: 32,
          constraints: { horizontal: 'MIN', vertical: 'MIN' },
        }),
        text({
          id: '1:42',
          name: '@CoinLabel',
          characters: '1200',
          fontFamily: 'Nunito',
          fontStyle: 'SemiBold',
          fontSize: 32,
          textAlignHorizontal: 'RIGHT',
          textStyleId: 'S:body',
          x: 820,
          y: 48,
          width: 212,
          height: 40,
          constraints: { horizontal: 'MAX', vertical: 'MIN' },
        }),
      ],
    }),
  ],
})

// ---------------------------------------------------------------- monta e valida

const result = await build([screen], { exportAssets: true, assetScale: 2 })

if (result.ir === null || result.screenName === null) {
  console.error('build falhou:')
  for (const item of result.bag.sorted()) {
    console.error(`  [${item.severity}] ${item.rule}: ${item.message}`)
  }
  process.exit(1)
}

if (result.bag.hasErrors) {
  console.error('o sample tem erros de lint — corrija a arvore em make-sample.ts:')
  for (const item of result.bag.sorted().filter((entry) => entry.severity === 'error')) {
    console.error(`  ${item.rule}: ${item.message}`)
  }
  process.exit(1)
}

const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object
const ajv = new (Ajv2020 as unknown as typeof import('ajv/dist/2020.js').default)({
  allErrors: true,
  strict: false,
})
addFormats(ajv as never)

if (!ajv.validate(schema, result.ir)) {
  console.error('o IR gerado nao valida contra o schema:')
  for (const error of ajv.errors ?? []) {
    console.error(`  ${error.instancePath} ${error.message}`)
  }
  process.exit(1)
}

// Timestamp fixo: o sample e commitado e usado como golden file dos testes de import.
// Com a hora real, todo `npm run sample` geraria diff sem nenhuma mudanca de conteudo.
result.ir.source.exportedAt = FIXED_TIMESTAMP

// O mock devolve bytes de brincadeira; o sample precisa de PNG que a Unity abra.
const files: Record<string, Uint8Array> = {
  'ui.json': strToU8(JSON.stringify(result.ir, null, 2)),
}

for (const packed of result.assets) {
  const declared = result.ir.assets.find((asset) => asset.file === packed.path)
  if (declared === undefined) {
    console.error(`asset ${packed.path} nao tem entrada no IR`)
    process.exit(1)
  }
  files[packed.path] = makePng(declared.width, declared.height, [90, 100, 140, 255])
}

// mtime explicito: sem ele o fflate grava a hora da compactacao no cabecalho do zip, e
// dois runs identicos produzem bytes diferentes. O DOS time do zip tem granularidade de 2
// segundos, o que faz o problema passar despercebido quando os runs sao seguidos.
const packed = zipSync(files, { level: 6, mtime: FIXED_TIMESTAMP })

const written: string[] = []
const skipped: string[] = []

mkdirSync(dirname(localTarget), { recursive: true })
writeFileSync(localTarget, packed)
written.push('samples/HomeMenu.uiexport')

for (const target of SIBLING_TARGETS) {
  const repoDir = `${here}/../../${target.repo}`

  if (!existsSync(repoDir)) {
    skipped.push(`${target.repo} (nao clonado ao lado)`)
    continue
  }

  const destination = `${repoDir}/${target.file}`
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, packed)
  written.push(`${target.repo}/${target.file}`)
}

const warnings = result.bag.sorted().filter((item) => item.severity === 'warning')

for (const path of written) {
  console.log(`gravado: ${path}`)
}
for (const path of skipped) {
  console.log(`pulado:  ${path}`)
}
console.log(`  ${result.nodeCount} layers, ${result.componentCount} componentes, ${result.bindCount} binds`)
console.log(`  ${Object.keys(files).length} arquivos no pacote`)
console.log(`  ${warnings.length} aviso(s) de lint`)
for (const item of warnings) {
  console.log(`    ${item.rule}: ${item.nodeName ?? '-'}`)
}
