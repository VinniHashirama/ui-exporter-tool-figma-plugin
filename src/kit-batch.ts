/**
 * Forma do pacote `.uikit` (exportar todo componente da página de uma vez).
 *
 * Fica separado da varredura de verdade (`code.ts`, que chama `buildComponent` node a nó e
 * toca a API do Figma) para essa forma poder ser testada sem simular Figma nenhum — é só
 * montagem de objeto e string.
 *
 * O leitor do lado da Unity é escrito contra este formato em paralelo, então o nome dos
 * campos e a regra de path aqui são contrato, não detalhe de implementação.
 */

export interface KitSource {
  fileKey: string
  fileName: string
  pageName: string
}

export interface KitComponentEntry {
  canonicalName: string
  path: string
}

export interface KitSkipped {
  name: string
  reason: string
}

export interface KitManifest {
  schemaVersion: string
  pluginVersion: string
  generatedAt: string
  source: KitSource
  components: KitComponentEntry[]
  skipped: KitSkipped[]
}

/** `Button/Primary` -> `Button_Primary`. Mesma regra do nome de arquivo do `.uicomponent` avulso. */
export function slugFor(canonicalName: string): string {
  return canonicalName.split('/').join('_')
}

export function componentPath(canonicalName: string): string {
  return `components/${slugFor(canonicalName)}/component.json`
}

/** `assetFile` já vem como `images/<arquivo>.png`, igual ao `.uicomponent` avulso. */
export function assetPath(canonicalName: string, assetFile: string): string {
  return `components/${slugFor(canonicalName)}/${assetFile}`
}

export function buildKitBatchManifest(
  source: KitSource,
  schemaVersion: string,
  pluginVersion: string,
  generatedAt: string,
  components: readonly { canonicalName: string }[],
  skipped: readonly KitSkipped[],
): KitManifest {
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
