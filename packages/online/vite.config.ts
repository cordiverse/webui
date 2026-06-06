/**
 * Unified Vite config for `@cordisjs/online`. Both dev (`vite`) and prod
 * (`vite.build` invoked by `src/bin.ts`) read this. Mode-specific bits split
 * via `defineConfig(({ command }) => ...)`.
 *
 * Two passes still exist for prod: this config covers the main client build;
 * the service worker has its own (smaller) config inside `src/bin.ts`,
 * because the SW needs the main build's hashed chunk URLs baked into it via
 * `__SINGLETON_URLS__` — only known after the main build runs.
 */

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import yaml from '@cordisjs/unyaml/vite'
import unocss from 'unocss/vite'
import uno from 'unocss/preset-uno'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { BUILTIN_SHIMS, MODULE_PREFIX } from './src/constants.ts'

const here = fileURLToPath(new URL('.', import.meta.url))
const clientRoot = resolve(here, 'client')
// Same-repo (webui/cordis) root. Used only for same-repo source aliases.
// Anything outside this is reached via `node_modules` (the package's
// declared dependencies), which is what CI sees.
const webuiRepo = resolve(here, '../..')

const alias: Record<string, string> = {
  // Same-repo source aliases.
  '@cordisjs/client/app': `${webuiRepo}/packages/client/app`,
  '@cordisjs/online': resolve(here, 'src/index.ts'),

  // Browser polyfill packages (host-bundled inline shims, NOT routed
  // through /-/modules/). Matches `BUILTIN_SHIMS` exclusions for
  // `process` and `buffer`.
  'buffer': 'buffer/',
  'node:buffer': 'buffer/',
  'events': 'events/',
  'node:events': 'events/',
  'node:module': resolve(clientRoot, 'shims/node-module.ts'),
  'module': resolve(clientRoot, 'shims/node-module.ts'),
}

/**
 * Replaces both `rollupOptions.external` (build-time) and the `<script
 * type="importmap">` injection (post-build). For every key in
 * `BUILTIN_SHIMS` (except `process`/`buffer` which are inline-shimmed):
 *
 * - **dev**: re-resolves to the underlying shim package (e.g. `@cordisjs/fs`)
 *   through Vite's normal pipeline, so `workspace-src` rewrites
 *   `<pkg>/lib/<x>.js` → `<pkg>/src/<x>.ts`. Has to be a file path because
 *   Vite's pre-transform follows imports and would otherwise try to load
 *   `/-/modules/@cordisjs/fs` as a file path under root (the
 *   `module-prefix` middleware only sees HTTP fetches, not Vite's
 *   internal transform-chain warmup).
 * - **build**: externalizes to a literal `/-/modules/<shim>` URL — the
 *   import statement in the output reads `import '/-/modules/@cordisjs/fs'`,
 *   browser resolves natively, SW intercepts at fetch time.
 */
function externalizeBuiltins(isDev: boolean) {
  const targets = new Map<string, string>()
  for (const [key, shim] of Object.entries(BUILTIN_SHIMS)) {
    if (key === 'process' || key === 'buffer') continue
    targets.set(key, shim)
    targets.set(`node:${key}`, shim)
  }
  return {
    name: 'cordis-online:externalize-builtins',
    enforce: 'pre' as const,
    async resolveId(this: any, id: string, importer: string | undefined, opts: any) {
      const shim = targets.get(id)
      if (!shim) return null
      if (isDev) {
        // Forward to the shim package; workspace-src will rewrite lib → src.
        return await this.resolve(shim, importer, { ...opts, skipSelf: true })
      }
      return { id: MODULE_PREFIX + shim, external: true }
    },
  }
}

/**
 * Rewrites resolved `<pkg>/lib/<x>.{js,cjs,mjs}` to `<pkg>/src/<x>.ts`
 * whenever the TS source exists. Lets workspace packages resolve via their
 * normal `package.json#exports` to `lib/` while still reading live source —
 * no per-package alias needed. Dev only; prod uses the published `lib/`
 * layout for fidelity.
 */
function workspaceSrc() {
  return {
    name: 'cordis-online:workspace-src',
    enforce: 'pre' as const,
    async resolveId(this: any, id: string, importer: string | undefined, opts: any) {
      if (!/^(?:@[^/]+\/)?[a-z0-9]/i.test(id)) return null
      if (id.startsWith('node:')) return null
      const resolved = await this.resolve(id, importer, { ...opts, skipSelf: true })
      if (!resolved || resolved.external) return null
      const m = /^(.+?)\/lib\/(.+)\.(?:js|cjs|mjs)$/.exec(resolved.id)
      if (!m) return null
      const tsCandidate = `${m[1]}/src/${m[2]}.ts`
      if (!existsSync(tsCandidate)) return null
      return { ...resolved, id: tsCandidate }
    },
  }
}

/**
 * `BrowserLoader.import` does `import('/-/modules/<name>')` at runtime.
 * In dev (no SW), this middleware resolves the bare specifier via the
 * plugin container and 302s to the matching `/@fs/<abs>` URL. After the
 * redirect every internal import is in Vite's native form.
 */
function modulePrefix() {
  return {
    name: 'cordis-online:module-prefix',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url = req.url ?? ''
        if (!url.startsWith(MODULE_PREFIX)) return next()
        const [pathPart, qs = ''] = url.slice(MODULE_PREFIX.length).split('?')
        const name = decodeURI(pathPart)
        const resolved = await server.pluginContainer.resolveId(name)
        if (!resolved) {
          res.statusCode = 404
          res.end(`Cannot resolve module: ${name}`)
          return
        }
        res.statusCode = 302
        res.setHeader('Location', '/@fs' + resolved.id + (qs ? '?' + qs : ''))
        res.end()
      })
    },
  }
}

/**
 * Injects `window.CLIENT_CONFIG = {...}` via `transformIndexHtml`. Replaces
 * both the dev plugin and the post-build manual injection in `build.ts`.
 */
function clientConfig(devMode: boolean) {
  return {
    name: 'cordis-online:client-config',
    transformIndexHtml(html: string) {
      const config = JSON.stringify({
        devMode,
        uiPath: '',
        endpoint: '',
        static: true,
        online: { enabled: true },
      })
      return html.replace('</title>', `</title>\n    <script>window.CLIENT_CONFIG = ${config}</script>`)
    },
  }
}

export default defineConfig(({ command }) => {
  const isDev = command === 'serve'
  return {
    root: clientRoot,
    base: '/',
    // See dev.ts/build.ts: `target: 'esnext'` (Vite's default) leaves TC39
    // stage 3 decorators raw. Drop to es2022 so esbuild downlevels them.
    // `useDefineForClassFields: true` forces `static name = X` to use
    // [[DefineOwnProperty]] semantics (otherwise esbuild's `static { this.name = X }`
    // hits Function.name's `writable: false` and throws at class init).
    esbuild: {
      target: 'es2022',
      tsconfigRaw: {
        compilerOptions: {
          useDefineForClassFields: true,
        },
      },
    },
    resolve: {
      extensions: ['.ts', '.js', '.json', '.yml', '.yaml', '.vue'],
      dedupe: ['vue', '@vueuse/core', 'element-plus', 'cordis', '@cordisjs/client'],
      alias,
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
      'process.env.CORDIS_ENV': JSON.stringify('browser'),
      ...(isDev ? {
        'process.cwd': '() => "/"',
        'process.execArgv': '[]',
      } : {}),
    },
    server: isDev ? {
      port: 31400,
      fs: {
        // dev-only: trust everything. yarn workspaces resolves symlinks
        // into the parent touhou monorepo (external/cordis/*, etc.); an
        // allow-list narrower than the whole filesystem would have to be
        // taught about the monorepo layout, which is what we'd just
        // undone in the rest of this config.
        strict: false,
      },
    } : undefined,
    optimizeDeps: isDev ? {
      include: [
        'schemastery',
        'element-plus',
        'marked',
        'xss',
        'semver',
        'spark-md5',
        'js-yaml',
      ],
      exclude: ['@cordisjs/muon'],
    } : undefined,
    build: !isDev ? {
      target: 'es2022',
      // Output relative to `root` (= client/), so `../dist` lands at the
      // package's dist/.
      outDir: '../dist',
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
    } : undefined,
    plugins: [
      vue(),
      yaml(),
      unocss({ presets: [uno({ preflight: false })] }),
      externalizeBuiltins(isDev),
      clientConfig(isDev),
      ...(isDev ? [workspaceSrc(), modulePrefix()] : []),
    ],
    // Vite spawns an inner rollup pass for the cordis-runtime Worker
    // (`new Worker(new URL('./worker/entry.ts', import.meta.url))` in
    // `bootstrap-main.ts`). Plugins from `plugins` above are NOT inherited
    // automatically by that sub-pass — re-declare the ones the worker
    // bundle actually needs. Without this, `node:fs/promises` etc. fall
    // through to Vite's default `__vite-browser-external` stub and rollup
    // dies on `MISSING_EXPORT: readFile`.
    worker: {
      format: 'es',
      plugins: () => [
        externalizeBuiltins(isDev),
        ...(isDev ? [workspaceSrc()] : []),
      ],
    },
  }
})
