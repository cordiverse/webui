import { OutputAsset, OutputChunk, RollupOutput } from 'rollup'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import * as vite from 'vite'
import unocss from 'unocss/vite'
import uno from 'unocss/preset-uno'
import vue from '@vitejs/plugin-vue'
import yaml from '@cordisjs/unyaml/vite'

const BASE_VERSION = 'v1'

function findModulePath(id: string) {
  const path = fileURLToPath(import.meta.resolve(id)).replace(/\\/g, '/')
  const keyword = `/node_modules/${id}/`
  return path.slice(0, path.indexOf(keyword)) + keyword.slice(0, -1)
}

function fullHash(content: string | Uint8Array) {
  return createHash('sha256').update(content).digest('hex')
}

function shortHash(content: string | Uint8Array) {
  return fullHash(content).slice(0, 8)
}

function entryFileName(output: RollupOutput): string {
  const chunk = output.output.find((f): f is OutputChunk => f.type === 'chunk' && f.isEntry)
  if (!chunk) throw new Error('no entry chunk in build output')
  return chunk.fileName
}

function takeCssAsset(output: RollupOutput): OutputAsset {
  const asset = output.output.find((f): f is OutputAsset => f.type === 'asset' && f.fileName.endsWith('.css'))
  if (!asset) throw new Error('no css asset in build output')
  return asset
}

function takeManifest(output: RollupOutput): Record<string, any> {
  const asset = output.output.find((f): f is OutputAsset => f.type === 'asset' && f.fileName === '.vite/manifest.json')
  if (!asset) throw new Error('no manifest in build output')
  return JSON.parse(asset.source.toString())
}

const cwd = resolve(fileURLToPath(import.meta.url), '../../../..')
const dist = cwd + '/plugins/webui/dist'

const EXTERNALS = ['vue', '@cordisjs/client']

interface BuildOptions extends vite.UserConfig {
  manifest?: boolean
}

async function build(root: string, config: BuildOptions = {}) {
  const { manifest, ...rest } = config
  const { rollupOptions = {} } = rest.build || {}
  return await vite.build({
    root,
    build: {
      outDir: dist,
      emptyOutDir: false,
      cssCodeSplit: false,
      manifest,
      ...rest.build,
      rollupOptions: {
        ...rollupOptions,
        external: EXTERNALS,
        output: {
          format: 'module',
          entryFileNames: '[name]-[hash].js',
          chunkFileNames: '[name]-[hash].js',
          assetFileNames: '[name]-[hash].[ext]',
          paths: Object.fromEntries(EXTERNALS.map((name) => [name, name])),
          ...rollupOptions.output,
        },
      },
    },
    plugins: [
      vue(),
      yaml(),
      ...rest.plugins ?? [],
    ],
  }) as RollupOutput
}

export default async function () {
  await rm(dist, { recursive: true, force: true })
  await mkdir(dist, { recursive: true })

  // 1. vue: prebuilt browser bundle, just copy with hash.
  const vueRaw = await readFile(findModulePath('vue') + '/dist/vue.runtime.esm-browser.prod.js')
  const vueFile = `vue-${shortHash(vueRaw)}.js`
  await writeFile(dist + '/' + vueFile, vueRaw)

  // 2. client (incl. element-plus manual chunk).
  const clientRoot = cwd + '/packages/client/client'
  const clientOutput = await build(clientRoot, {
    manifest: true,
    build: {
      chunkSizeWarningLimit: 1024 * 1024,
      rollupOptions: {
        input: { client: clientRoot + '/index.ts' },
        output: {
          manualChunks: {
            element: ['element-plus'],
          },
        },
        preserveEntrySignatures: 'strict',
      },
    },
  })
  const clientFile = entryFileName(clientOutput)

  // 3. app (html entry) — emits Vite manifest at dist/.vite/manifest.json.
  const appOutput = await build(cwd + '/packages/client/app', {
    manifest: true,
    plugins: [
      unocss({
        presets: [uno({ preflight: false })],
      }),
    ],
  })

  // 4. read manifests + css assets straight out of the in-memory RollupOutputs
  //    (no disk roundtrip, no ordering dependency on snapshotting client's
  //    manifest before app build overwrites it).
  const clientManifest = takeManifest(clientOutput)
  const appManifest = takeManifest(appOutput)
  const clientCssAsset = takeCssAsset(clientOutput)
  const appCssAsset = takeCssAsset(appOutput)
  const cssMerged = clientCssAsset.source.toString() + appCssAsset.source.toString()
  const cssFinal = `style-${shortHash(clientCssAsset.fileName + appCssAsset.fileName)}.css`

  // 5. write WebuiManifest = { version, resolve }. version is a full sha256 of
  //    BASE_VERSION concatenated with every generated artifact's filename (vue,
  //    client, element manualChunk, app entry, and the two intermediate CSS
  //    filenames so a CSS-only change in either build still bumps the version).
  //    Full-length to avoid collisions across builds — a `version` mismatch is
  //    what tells clients to reload, so a collision would silently leave them
  //    on stale code.
  const elementChunk = Object.values(clientManifest).find((c: any) => c.name === 'element' && c.file?.endsWith('.js')) as any
  const appEntryChunk = Object.values(appManifest).find((c: any) => c.isEntry && c.file?.endsWith('.js')) as any
  const filenames = [
    vueFile,
    clientFile,
    elementChunk.file,
    appEntryChunk.file,
    clientCssAsset.fileName,
    appCssAsset.fileName,
  ]
  const version = fullHash(BASE_VERSION + filenames.join(''))
  const resolve: Record<string, string> = {
    'vue': vueFile,
    '@cordisjs/client': clientFile,
  }

  // 6. patch index.html, drop intermediate css files, write merged css and the
  //    final manifest in parallel.
  const html = await readFile(dist + '/index.html', 'utf-8')
  const htmlPatched = html.replace(/style-[A-Za-z0-9_-]+\.css/g, cssFinal)
  await Promise.all([
    writeFile(dist + '/' + cssFinal, cssMerged),
    writeFile(dist + '/index.html', htmlPatched),
    writeFile(dist + '/manifest.json', JSON.stringify({ version, resolve }, null, 2)),
    rm(dist + '/.vite', { recursive: true, force: true }),
    rm(dist + '/' + clientCssAsset.fileName, { force: true }),
    rm(dist + '/' + appCssAsset.fileName, { force: true }),
  ])
}
