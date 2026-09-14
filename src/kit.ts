/**
 * Vocabulario canonico do kit. Precisa ficar em sincronia com https://github.com/VinniHashirama/ui-exporter-tool-docs-and-samples/blob/main/docs/prefab-kit.md e com
 * os prefabs que carregam UIKitComponent na Unity.
 *
 * O plugin usa esta lista apenas para AVISAR o designer que um componente nao tem
 * contraparte na Unity. A resolucao de verdade acontece no importador, varrendo o
 * projeto — entao um kit que evoluiu na Unity sem atualizar esta lista gera aviso
 * falso, nunca falha de import.
 */

/**
 * O kit agrupado como o designer o enxerga na UI do plugin.
 *
 * Fica aqui, e nao no kit-builder, porque a UI do plugin roda num bundle separado que nao
 * pode importar codigo que toca a API do Figma. Derivando a lista da UI e as receitas do
 * builder desta mesma constante, nao ha como a lista que o designer ve divergir do que o
 * botao realmente cria.
 *
 * `Screen` nao entra: no Figma ele e convencao de nome de frame, entregue como template.
 */
export const KIT_CATALOG = [
  { title: 'Containers', items: ['Panel', 'Window/Modal', 'ScrollView'] },
  { title: 'Ações', items: ['Button/Primary', 'Button/Secondary', 'Button/Icon'] },
  { title: 'Entrada', items: ['Toggle/Checkbox', 'Slider', 'InputField'] },
  { title: 'Exibição', items: ['Label', 'Icon', 'Image', 'ProgressBar'] },
  { title: 'Navegação', items: ['Tabs'] },
] as const

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

/**
 * Papeis de um componente customizado.
 *
 * O papel e o que o Figma nao consegue expressar: um retangulo com texto dentro e um botao
 * ou um rotulo? Quem monta o componente responde uma vez, aqui, e o importador usa isso para
 * escolher o esqueleto de comportamento na Unity em vez de adivinhar pela forma.
 */
export const CUSTOM_ROLES = ['button', 'toggle', 'container', 'display', 'icon', 'image'] as const

export type CustomRole = (typeof CUSTOM_ROLES)[number]

export const ROLE_LABELS: Readonly<Record<CustomRole, string>> = {
  button: 'Botão — clicável, com estados',
  toggle: 'Toggle — liga/desliga, com marca',
  container: 'Container — agrupa outros elementos',
  display: 'Exibição — texto ou valor, sem interação',
  icon: 'Ícone — imagem quadrada',
  image: 'Imagem — arte livre',
}

export function isCustomRole(value: string): value is CustomRole {
  return (CUSTOM_ROLES as readonly string[]).includes(value)
}

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
