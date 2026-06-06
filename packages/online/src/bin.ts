/**
 * Production build driver for `@cordisjs/online`. Invoked by yakumo's client
 * pipeline (see `package.json#yakumo.client`) and runnable directly via
 * `tsx src/bin.ts`.
 *
 * Two sequential builds:
 *
 *   1. Main client — reads `../vite.config.ts` (same config dev uses).
 *      Output: dist/{index.html, assets/*.{js,css}, manifest.json}.
 *
 *   2. Service worker — standalone iife at `dist/sw.js`. Different surface
 *      from main (no vue/yaml/unocss/aliases/externalize-builtins), so it
 *      doesn't share vite.config.ts; built with an inline config here.
 *      `__SINGLETON_URLS__` is baked in via Vite `define`, populated from
 *      main's hashed chunk paths.
 *
 * No post-processing on `dist/index.html`. The `client-config` plugin in
 * `vite.config.ts` handles `window.CLIENT_CONFIG` injection during the main
 * build; `<script type="importmap">` injection was removed — node-builtin
 * imports in the bundle are now literal `/-/modules/...` URLs (see
 * `externalizeBuiltins` in `vite.config.ts`), resolved by the SW at fetch
 * time, so no static importmap is needed.
 */

import * as vite from 'vite'
import { mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import type { RollupOutput } from 'rollup'

const here = fileURLToPath(new URL('.', import.meta.url))
const pkgRoot = resolve(here, '..')
const clientRoot = resolve(pkgRoot, 'client')
const dist = resolve(pkgRoot, 'dist')

export default async function build() {
  await rm(dist, { recursive: true, force: true })
  await mkdir(dist, { recursive: true })

  // 1. Main client build.
  const clientOutput = (await vite.build({
    configFile: resolve(pkgRoot, 'vite.config.ts'),
  })) as RollupOutput | RollupOutput[]
  const output = Array.isArray(clientOutput) ? clientOutput[0] : clientOutput

  // 2. Build the singleton URL table by scanning the output for entry chunks.
  // The SW uses these to 307 `/-/modules/vue` → `/assets/vue-<hash>.js`.
  const singletonUrls: Record<string, string> = {}
  for (const chunk of output.output) {
    if (chunk.type !== 'chunk') continue
    if (chunk.name === 'vue') singletonUrls['vue'] = `/${chunk.fileName}`
    if (chunk.name === 'element') singletonUrls['element-plus'] = `/${chunk.fileName}`
  }
  // Anything not separately chunked is in the entry; the SW falls back to
  // fetching from CDN for those (Vite's dep optimizer already deduped them
  // during the main build).

  // 3. Service worker build. iife, single file, no shared config.
  await vite.build({
    root: clientRoot,
    configFile: false,
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
        output: { inlineDynamicImports: true },
      },
    },
    define: {
      '__SINGLETON_URLS__': JSON.stringify(singletonUrls),
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
  })
}

// Auto-invoke when run directly. Yakumo's client pipeline imports the default
// export and calls it itself, so this guard prevents a double-build.
if (import.meta.url === `file://${process.argv[1]}`) {
  await build()
}
