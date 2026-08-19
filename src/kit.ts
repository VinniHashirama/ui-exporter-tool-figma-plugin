/**
 * Vocabulario canonico do kit. Precisa ficar em sincronia com https://github.com/VinniHashirama/ui-exporter-tool-docs-and-samples/blob/main/docs/prefab-kit.md e com
 * os prefabs que carregam UIKitComponent na Unity.
 *
 * O plugin usa esta lista apenas para AVISAR o designer que um componente nao tem
 * contraparte na Unity. A resolucao de verdade acontece no importador, varrendo o
 * projeto — entao um kit que evoluiu na Unity sem atualizar esta lista gera aviso
 * falso, nunca falha de import.
 */

export const KIT_V1 = [
  // Containers
  'Screen',
  'Panel',
  'Window/Modal',
  'ScrollView',
  // Acoes
  'Button/Primary',
  'Button/Secondary',
  'Button/Icon',
  // Entrada
  'Toggle/Checkbox',
  'Slider',
  'InputField',
  // Exibicao
  'Label',
  'Icon',
  'Image',
  'ProgressBar',
  // Navegacao
  'Tabs',
] as const

const KIT_SET: ReadonlySet<string> = new Set(KIT_V1)

/** Familias do kit, para detectar frame improvisado no lugar de instancia. */
const KIT_FAMILIES: ReadonlySet<string> = new Set(
  KIT_V1.map((name) => name.split('/')[0]!),
)

export function isKnownComponent(canonicalName: string): boolean {
  return KIT_SET.has(canonicalName)
}

/**
 * Um frame chamado `Button` ou `Window/Modal` que NAO e instancia normalmente e
 * componente descolado da Library, ou improviso com retangulo. Vale avisar: na Unity
 * vira caixa sem comportamento.
 */
export function looksLikeKitName(canonicalName: string): boolean {
  if (KIT_SET.has(canonicalName)) return true
  const family = canonicalName.split('/')[0]
  return family !== undefined && KIT_FAMILIES.has(family)
}

/**
 * Propriedades de instancia que o importador trata como o texto principal do
 * componente (slot `label`). Comparacao case-insensitive.
 */
export const LABEL_PROPERTY_NAMES: readonly string[] = ['label', 'text', 'title', 'caption']
