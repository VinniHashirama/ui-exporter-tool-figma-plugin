/**
 * Forma do pacote `.uikitset` (exportar todo componente da página de uma vez).
 *
 * Fica separado da varredura de verdade (`code.ts`, que chama `buildComponent` node a nó e
 * toca a API do Figma) para essa forma poder ser testada sem simular Figma nenhum — é só
 * montagem de objeto e string.
 *
 * O leitor do lado da Unity é escrito contra este formato em paralelo, então o nome dos
 * campos e a regra de path aqui são contrato, não detalhe de implementação.
 */

export interface KitBatchSource {
  fileKey: string
  fileName: string
  pageName: string
}

export interface KitBatchComponentEntry {
  canonicalName: string
  path: string
}

export interface KitBatchSkipped {
  name: string
  reason: string
}

export interface KitBatchManifest {
  schemaVersion: string
  pluginVersion: string
  generatedAt: string
  source: KitBatchSource
  components: KitBatchComponentEntry[]
  skipped: KitBatchSkipped[]
}

/** `Button/Primary` -> `Button_Primary`. Mesma regra do nome de arquivo do `.uikit` avulso. */
export function slugFor(canonicalName: string): string {
  return canonicalName.split('/').join('_')
}

export function componentPath(canonicalName: string): string {
  return `components/${slugFor(canonicalName)}/kit.json`
}

/** `assetFile` já vem como `images/<arquivo>.png`, igual ao `.uikit` avulso. */
export function assetPath(canonicalName: string, assetFile: string): string {
  return `components/${slugFor(canonicalName)}/${assetFile}`
}

export function buildKitBatchManifest(
  source: KitBatchSource,
  schemaVersion: string,
  pluginVersion: string,
  generatedAt: string,
  components: readonly { canonicalName: string }[],
  skipped: readonly KitBatchSkipped[],
): KitBatchManifest {
  return {
    schemaVersion,
    pluginVersion,
    generatedAt,
    source,
    components: components.map((component) => ({
      canonicalName: component.canonicalName,
      path: componentPath(component.canonicalName),
    })),
    skipped: [...skipped],
  }
}
