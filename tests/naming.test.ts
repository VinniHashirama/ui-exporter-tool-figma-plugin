import { describe, expect, it } from 'vitest'
import {
  isDefaultLayerName,
  isValidBind,
  normalizeCanonicalName,
  parseName,
  parseScreenName,
  sanitizeName,
  toAssetId,
  toTokenRef,
} from '../src/naming'

/** Montado em runtime: caractere de controle literal no fonte corrompe o arquivo. */
const BELL = String.fromCharCode(7)
const TAB = String.fromCharCode(9)
const NUL = String.fromCharCode(0)

describe('parseName', () => {
  it('mantem nome comum intacto', () => {
    expect(parseName('Header')).toEqual({
      clean: 'Header',
      bind: null,
      flatten: false,
      locKey: null,
      ignored: false,
      nineSlice: null,
    })
  })

  it('ignora layer com prefixo _', () => {
    expect(parseName('_notes').ignored).toBe(true)
    expect(parseName('_specs de layout').ignored).toBe(true)
  })

  it('extrai bind do prefixo @', () => {
    const parsed = parseName('@PlayButton')
    expect(parsed.bind).toBe('PlayButton')
    expect(parsed.clean).toBe('PlayButton')
  })

  it('extrai flatten do sufixo #img', () => {
    const parsed = parseName('hero#img')
    expect(parsed.flatten).toBe(true)
    expect(parsed.clean).toBe('hero')
  })

  it('extrai locKey do sufixo :chave', () => {
    const parsed = parseName('title:loc.menu.title')
    expect(parsed.locKey).toBe('loc.menu.title')
    expect(parsed.clean).toBe('title')
  })

  it('aceita os dois sufixos em qualquer ordem', () => {
    const a = parseName('hero#img:loc.x')
    const b = parseName('hero:loc.x#img')

    expect(a.flatten).toBe(true)
    expect(a.locKey).toBe('loc.x')
    expect(a.clean).toBe('hero')

    expect(b.flatten).toBe(true)
    expect(b.locKey).toBe('loc.x')
    expect(b.clean).toBe('hero')
  })

  it('combina bind com locKey', () => {
    const parsed = parseName('@CoinLabel:loc.hud.coins')
    expect(parsed.bind).toBe('CoinLabel')
    expect(parsed.locKey).toBe('loc.hud.coins')
    expect(parsed.clean).toBe('CoinLabel')
  })

  it('devolve bind invalido cru, para o lint poder reclamar', () => {
    const parsed = parseName('@2play button')
    expect(parsed.bind).toBe('2play button')
    expect(isValidBind(parsed.bind!)).toBe(false)
  })
})

describe('isValidBind', () => {
  it('aceita identificador C# valido', () => {
    expect(isValidBind('PlayButton')).toBe(true)
    expect(isValidBind('_private')).toBe(true)
    expect(isValidBind('Coin2')).toBe(true)
  })

  it('recusa o que nao vira campo', () => {
    expect(isValidBind('2Coin')).toBe(false)
    expect(isValidBind('play button')).toBe(false)
    expect(isValidBind('botão')).toBe(false)
    expect(isValidBind('')).toBe(false)
  })
})

describe('parseScreenName', () => {
  it('extrai o nome da tela', () => {
    expect(parseScreenName('screen/HomeMenu')).toBe('HomeMenu')
    expect(parseScreenName('  screen/RewardPopup  ')).toBe('RewardPopup')
  })

  it('recusa o que esta fora do padrao', () => {
    expect(parseScreenName('HomeMenu')).toBeNull()
    expect(parseScreenName('screen/home menu')).toBeNull()
    expect(parseScreenName('Screen/HomeMenu')).toBeNull()
    expect(parseScreenName('screen/')).toBeNull()
    expect(parseScreenName('Frame 1')).toBeNull()
  })
})

describe('sanitizeName', () => {
  it('preserva acentuacao portuguesa', () => {
    expect(sanitizeName('Configurações')).toBe('Configurações')
    expect(sanitizeName('Botão de Ação')).toBe('Botão de Ação')
  })

  it('preserva hifen, ponto, underscore e parenteses', () => {
    expect(sanitizeName('btn-play_v2 (novo).png')).toBe('btn-play_v2 (novo).png')
  })

  it('remove caracteres invalidos em path', () => {
    expect(sanitizeName('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j')
  })

  it('remove caracteres de controle', () => {
    expect(sanitizeName(`Botao${BELL}X`)).toBe('Botao X')
    expect(sanitizeName(`Tab${TAB}Aqui`)).toBe('Tab Aqui')
    expect(sanitizeName(`Nulo${NUL}Aqui`)).toBe('Nulo Aqui')
  })

  it('nao termina em ponto nem espaco', () => {
    expect(sanitizeName('Nome.')).toBe('Nome')
    expect(sanitizeName('Nome   ')).toBe('Nome')
  })

  it('nunca devolve vazio', () => {
    expect(sanitizeName('')).toBe('Node')
    expect(sanitizeName('///')).toBe('Node')
    expect(sanitizeName(NUL)).toBe('Node')
  })

  it('limita o tamanho', () => {
    expect(sanitizeName('a'.repeat(200)).length).toBe(64)
  })
})

describe('toAssetId', () => {
  it('produz id valido para o schema', () => {
    const id = toAssetId('hero art', '1:23')
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(id).toBe('hero-art_1-23')
  })

  it('nao colide entre nodes de nome igual', () => {
    expect(toAssetId('icon', '1:1')).not.toBe(toAssetId('icon', '1:2'))
  })

  it('sobrevive a nome inteiramente invalido', () => {
    expect(toAssetId('ção///', '5:9')).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('toTokenRef', () => {
  it('converte caminho de estilo em token', () => {
    expect(toTokenRef('color/primary')).toBe('color.primary')
    expect(toTokenRef('text / h1')).toBe('text.h1')
    expect(toTokenRef('Brand Colors/Accent Warm')).toBe('Brand-Colors.Accent-Warm')
  })

  it('devolve null quando nao sobra nada', () => {
    expect(toTokenRef('///')).toBeNull()
    expect(toTokenRef('   ')).toBeNull()
  })
})

describe('isDefaultLayerName', () => {
  it('detecta nome automatico do Figma', () => {
    expect(isDefaultLayerName('Frame 42')).toBe(true)
    expect(isDefaultLayerName('Rectangle 5')).toBe(true)
    expect(isDefaultLayerName('Vector')).toBe(true)
    expect(isDefaultLayerName('Union')).toBe(true)
  })

  it('nao acusa nome intencional', () => {
    expect(isDefaultLayerName('Header')).toBe(false)
    expect(isDefaultLayerName('Frame do topo')).toBe(false)
    expect(isDefaultLayerName('Icon')).toBe(false)
    expect(isDefaultLayerName('Button/Primary')).toBe(false)
  })
})

describe('normalizeCanonicalName', () => {
  it('normaliza espaco em volta da barra', () => {
    expect(normalizeCanonicalName('Button / Primary')).toBe('Button/Primary')
    expect(normalizeCanonicalName('Button/Primary')).toBe('Button/Primary')
  })

  it('faz PascalCase de nome com espaco', () => {
    expect(normalizeCanonicalName('window modal')).toBe('WindowModal')
    expect(normalizeCanonicalName('progress-bar')).toBe('ProgressBar')
  })

  it('preserva capitalizacao interna', () => {
    expect(normalizeCanonicalName('HUD/StatBar')).toBe('HUD/StatBar')
  })

  it('devolve null quando nao da para normalizar', () => {
    expect(normalizeCanonicalName('')).toBeNull()
    expect(normalizeCanonicalName('///')).toBeNull()
    expect(normalizeCanonicalName('123')).toBeNull()
  })
})
