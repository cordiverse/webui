/**
 * Production build for `@cordisjs/online`. Produces `dist/` containing:
 *
 *   index.html       — shell with importmap + CLIENT_CONFIG + SW reg
 *   sw.js            — service worker bundle (iife)
 *   assets/*.js      — entry + chunks for the client (vue, cordis, etc.)
 *   assets/*.css     — element-plus + cordis-client styles, merged
 *
 * Two separate Vite builds run sequentially:
 *
 * 1. Main client: ESM, hashed chunks, manualChunks puts element-plus in its
 *    own bundle so the entry chunk stays small.
 * 2. Service worker: iife bundle, single file, with the singleton URL table
 *    baked in via Vite `define` so the SW can intercept and redirect
 *    without runtime config-fetching.
 *
 * Singleton enforcement: after the main build completes we know the hashed
 * paths of the host-bundled `vue`, `cordis`, `@cordisjs/client`, etc.
 * Those URLs feed into the SW build as `__SINGLETON_URLS__`, AND get
 * injected into `index.html` as `<script type="importmap">` for any
 * dynamic imports that DON'T go through the SW (e.g. inline `<script
 * type="module">` payloads).
 */

import * as vite from 'vite'
import vue from '@vitejs/plugin-vue'
import yaml from '@cordisjs/unyaml/vite'
import unocss from 'unocss/vite'
import uno from 'unocss/preset-uno'
import { OutputChunk, OutputAsset, RollupOutput } from 'rollup'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { SINGLETONS } from './constants.ts'

const here = fileURLToPath(new URL('.', import.meta.url))
const pkgRoot = resolve(here, '..')
const clientRoot = resolve(pkgRoot, 'client')
const dist = resolve(pkgRoot, 'dist')
// Path to the `webui/cordis` repo root (this package's repo). Used for the
// same-repo source aliases below. Other Cordiverse repos (cordis core,
// ponyfills, etc.) are resolved through `node_modules` — they're declared as
// dependencies in `package.json` and the CI checks out only this repo, so
// reaching into sibling repos via filesystem paths breaks the prod build.
const webuiRepo = resolve(pkgRoot, '../..')

const alias = buildAliases()

function buildAliases(): Record<string, string> {
  return {
    // Same-repo (webui/cordis) — point at source for fast iteration. These
    // packages are workspace siblings; Vite resolves them via Yarn workspaces
    // too, but explicit source aliases pick the `.ts` entry without going
    // through each package's `exports` map (which today still points at
    // `lib/`, requiring a prior build).
    '@cordisjs/plugin-webui': `${webuiRepo}/plugins/webui/src/browser.ts`,
    '@cordisjs/client/app': `${webuiRepo}/packages/client/app`,
    '@cordisjs/client': `${webuiRepo}/packages/client/client/index.ts`,
    '@cordisjs/components': `${webuiRepo}/packages/components/client/index.ts`,
    '@cordisjs/online': resolve(pkgRoot, 'src/index.ts'),

    // Node builtins → ponyfill bare specifier. Vite then resolves
    // `@cordisjs/fs` through node_modules to its published `lib/` (CJS),
    // letting esbuild/rollup handle interop. Pointing at ponyfill `src/`
    // here would re-introduce the cross-repo path dependency we're trying
    // to remove. The dev server (`dev.ts`) keeps the source aliases since
    // dev only runs locally with the full monorepo checked out.
    'fs/promises': '@cordisjs/fs/promises',
    'node:fs/promises': '@cordisjs/fs/promises',
    'fs': '@cordisjs/fs',
    'node:fs': '@cordisjs/fs',
    'path': '@cordisjs/path',
    'node:path': '@cordisjs/path',
    'url': '@cordisjs/url',
    'node:url': '@cordisjs/url',
    'os': '@cordisjs/os',
    'node:os': '@cordisjs/os',
    'sqlite': '@cordisjs/sqlite',
    'node:sqlite': '@cordisjs/sqlite',

    // Pure browser shims via npm.
    'buffer': 'buffer/',
    'node:buffer': 'buffer/',
    'events': 'events/',
    'node:events': 'events/',
    'node:module': resolve(clientRoot, 'shims/node-module.ts'),
    'module': resolve(clientRoot, 'shims/node-module.ts'),
  }
}

interface ImportmapEntry {
  name: string
  url: string
}

export default async function build() {
  await rm(dist, { recursive: true, force: true })
  await mkdir(dist, { recursive: true })

  // 1. Main client build.
  const clientOutput = (await vite.build({
    root: clientRoot,
    base: '/',
    // See dev.ts — `target: 'esnext'` leaves TC39 stage 3 decorators in the
    // output. Drop to es2022 so esbuild downlevels them.
    esbuild: { target: 'es2022', tsconfigRaw: { compilerOptions: { useDefineForClassFields: true } } },
    build: {
      target: 'es2022',
      outDir: dist,
      emptyOutDir: false,
      cssCodeSplit: false,
      manifest: 'manifest.json',
      rollupOptions: {
        input: `${clientRoot}/index.html`,
        output: {
          format: 'module',
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          manualChunks: {
            element: ['element-plus'],
            vue: ['vue', '@vueuse/core'],
          },
        },
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env.CORDIS_ENV': JSON.stringify('browser'),
    },
    resolve: {
      extensions: ['.ts', '.js', '.json', '.yml', '.yaml', '.vue'],
      dedupe: ['vue', '@vueuse/core', 'element-plus', 'cordis', '@cordisjs/client'],
      alias,
    },
    plugins: [
      vue(),
      yaml(),
      unocss({ presets: [uno({ preflight: false })] }),
    ],
  })) as RollupOutput | RollupOutput[]

  const output = Array.isArray(clientOutput) ? clientOutput[0] : clientOutput

  // 2. Build the singleton URL table by scanning the output for entry chunks.
  const singletonUrls: Record<string, string> = {}
  for (const chunk of output.output) {
    if (chunk.type !== 'chunk') continue
    if (chunk.name === 'vue') singletonUrls['vue'] = `/${chunk.fileName}`
    if (chunk.name === 'element') singletonUrls['element-plus'] = `/${chunk.fileName}`
  }
  // Anything not separately chunked is in the entry; the SW will fall back
  // to fetching from CDN for those (which is fine — the dep optimizer
  // already deduped during the main build).

  // 3. Build the service worker.
  const swOutput = (await vite.build({
    root: clientRoot,
    esbuild: { target: 'es2022', tsconfigRaw: { compilerOptions: { useDefineForClassFields: true } } },
    build: {
      target: 'es2022',
      outDir: dist,
      emptyOutDir: false,
      lib: {
        entry: `${clientRoot}/service-worker.ts`,
        formats: ['iife'],
        name: 'cordisOnlineSW',
        fileName: () => 'sw.js',
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
    define: {
      '__SINGLETON_URLS__': JSON.stringify(singletonUrls),
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    resolve: { alias },
  })) as RollupOutput | RollupOutput[]
  void swOutput

  // 4. Inject importmap + CLIENT_CONFIG into the generated index.html.
  const indexPath = resolve(dist, 'index.html')
  let html = await readFile(indexPath, 'utf-8')
  const importmap: ImportmapEntry[] = []
  for (const name of SINGLETONS) {
    if (singletonUrls[name]) importmap.push({ name, url: singletonUrls[name] })
  }
  const head = [
    `<script type="importmap">${JSON.stringify({
      imports: Object.fromEntries(importmap.map(e => [e.name, e.url])),
    })}</script>`,
    `<script>window.CLIENT_CONFIG = ${JSON.stringify({
      devMode: false,
      uiPath: '',
      endpoint: '',
      static: true,
      online: { enabled: true },
    })}</script>`,
  ].join('\n    ')
  html = html.replace('</title>', `</title>\n    ${head}`)
  await writeFile(indexPath, html)
}

// Auto-invoke when run directly (e.g. `tsx src/build.ts`). When loaded by
// yakumo's client pipeline, the harness imports the default export and calls
// it itself, so this guard prevents a double-build.
if (import.meta.url === `file://${process.argv[1]}`) {
  await build()
}
