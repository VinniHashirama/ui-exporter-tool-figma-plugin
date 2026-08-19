import * as esbuild from 'esbuild'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const src = join(root, 'src')
const dist = join(root, 'dist')
const watch = process.argv.includes('--watch')

/**
 * O Figma exige que a UI seja um unico arquivo HTML autocontido: nao pode carregar
 * script externo. Entao buildamos ui.ts para dist/ui.js, injetamos inline no template
 * e apagamos o .js intermediario.
 */
const inlineUiHtml = {
  name: 'inline-ui-html',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0) return

      const js = await readFile(join(dist, 'ui.js'), 'utf8')
      const template = await readFile(join(src, 'ui.html'), 'utf8')

      if (!template.includes('{{SCRIPT}}')) {
        throw new Error('src/ui.html nao tem o marcador {{SCRIPT}}')
      }
      if (js.includes('</script')) {
        throw new Error('o bundle da UI contem "</script" e quebraria o HTML inline')
      }

      // Replacer como funcao: evita que $& / $' no bundle sejam interpretados como
      // padroes de substituicao.
      const html = template.replace('{{SCRIPT}}', () => `<script>\n${js}\n</script>`)

      await writeFile(join(dist, 'ui.html'), html, 'utf8')
      await rm(join(dist, 'ui.js'), { force: true })
      console.log(`  dist/ui.html    ${(html.length / 1024).toFixed(1)}kb`)
    })
  },
}

const common = {
  bundle: true,
  target: 'es2020',
  format: 'iife',
  legalComments: 'none',
  logLevel: 'warning',
  // dist/ e commitado para o designer nao precisar de Node: bundle nao minificado
  // mantem o diff legivel em review.
  minify: false,
  sourcemap: watch ? 'inline' : false,
}

const sandbox = {
  ...common,
  entryPoints: [join(src, 'code.ts')],
  outfile: join(dist, 'code.js'),
  // O sandbox do Figma nao e browser nem node: sem DOM, sem APIs de plataforma.
  platform: 'neutral',
  mainFields: ['module', 'main'],
}

const ui = {
  ...common,
  entryPoints: [join(src, 'ui.ts')],
  outfile: join(dist, 'ui.js'),
  platform: 'browser',
  plugins: [inlineUiHtml],
}

await mkdir(dist, { recursive: true })

if (watch) {
  const contexts = await Promise.all([esbuild.context(sandbox), esbuild.context(ui)])
  await Promise.all(contexts.map((c) => c.watch()))
  console.log('watching src/ ...')
} else {
  await esbuild.build(sandbox)
  await esbuild.build(ui)
  console.log('build ok')
}
