/**
 * Vite dev server for `@cordisjs/online`. Mounts `client/index.html` at
 * `http://localhost:3000/`.
 *
 * Dev mode does NOT register the service worker. Instead:
 *
 *   - `cordis-online:workspace-src` (resolveId): rewrites resolved
 *     `<pkg>/lib/<x>.{js,cjs,mjs}` to `<pkg>/src/<x>.ts` when the source
 *     exists. Lets workspace packages resolve through their normal
 *     `package.json#exports` to `lib/` while still reading live source.
 *
 *   - `cordis-online:module-prefix` (middleware): `BrowserLoader.import`
 *     does `import('/-/modules/<name>')`. The middleware resolves the bare
 *     specifier via Vite's plugin container and 302s to the corresponding
 *     `/@fs/<abs-path>` URL. After the redirect, `import.meta.url` is the
 *     standard Vite `/@fs/` form, and every internal import (relative /
 *     bare) is rewritten by Vite's import-analysis to other `/@fs/` URLs.
 *     We don't try to maintain a parallel URL space — `manifest.path`-style
 *     concerns are handled by `OnlineWebUI.getEntryFiles`, which uses
 *     `new URL(chunk.file, manifest.url)` and is URL-scheme-agnostic.
 *
 * Production builds (`src/build.ts`) emit an SW bundle that owns the
 * `/-/modules/...` URL space at runtime (CDN-backed).
 *
 * Aliases are reserved for: (a) subpaths Vite's default resolver can't see
 * (`@cordisjs/client/app`), (b) node-builtin shims (ponyfills), and (c)
 * self-references.
 */

import * as vite from 'vite'
import vue from '@vitejs/plugin-vue'
import yaml from '@cordisjs/unyaml/vite'
import unocss from 'unocss/vite'
import uno from 'unocss/preset-uno'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { MODULE_PREFIX } from './constants.ts'

const here = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(here, '../client')
const repo = resolve(here, '../../../../..')

const ponyfills = `${repo}/webui/cordis/external/ponyfills/packages`

const alias: Record<string, string> = {
  // Subpath / source-pointing aliases (Vite default resolution doesn't
  // cover these — `@cordisjs/client/app` isn't in client's `exports`, and
  // `@cordisjs/online` is a self-reference).
  '@cordisjs/client/app': `${repo}/webui/cordis/packages/client/app`,
  '@cordisjs/online': resolve(here, '../src/index.ts'),

  // Node builtin → @cordisjs/* ponyfill src/ (the published `lib/` is CJS;
  // pointing at the ESM TypeScript source lets Vite's dep optimizer skip
  // CommonJS interop entirely in dev).
  'fs/promises': `${ponyfills}/fs/src/promises.ts`,
  'node:fs/promises': `${ponyfills}/fs/src/promises.ts`,
  '@cordisjs/fs/promises': `${ponyfills}/fs/src/promises.ts`,
  'fs': `${ponyfills}/fs/src/index.ts`,
  'node:fs': `${ponyfills}/fs/src/index.ts`,
  '@cordisjs/fs': `${ponyfills}/fs/src/index.ts`,
  'path': `${ponyfills}/path/src/index.ts`,
  'node:path': `${ponyfills}/path/src/index.ts`,
  '@cordisjs/path': `${ponyfills}/path/src/index.ts`,
  'url': `${ponyfills}/url/src/index.ts`,
  'node:url': `${ponyfills}/url/src/index.ts`,
  '@cordisjs/url': `${ponyfills}/url/src/index.ts`,
  'os': `${ponyfills}/os/src/index.ts`,
  'node:os': `${ponyfills}/os/src/index.ts`,
  '@cordisjs/os': `${ponyfills}/os/src/index.ts`,
  'sqlite': `${ponyfills}/sqlite/src/index.ts`,
  'node:sqlite': `${ponyfills}/sqlite/src/index.ts`,
  '@cordisjs/sqlite': `${ponyfills}/sqlite/src/index.ts`,

  // Pure browser shims via npm.
  'buffer': 'buffer/',
  'node:buffer': 'buffer/',
  'events': 'events/',
  'node:events': 'events/',
  'node:module': resolve(here, '../client/shims/node-module.ts'),
  'module': resolve(here, '../client/shims/node-module.ts'),
}

const server = await vite.createServer({
  root,
  server: {
    port: 31400,
    fs: {
      allow: [repo]
    },
    // Cross-origin isolation — required for `SharedArrayBuffer` (used by
    // @cordisjs/sqlite's sync bridge). Browser support: every request the
    // dev server emits needs both. Third-party fetches must arrive with a
    // matching CORP header; for CDN assets the SW adds one in prod, in dev
    // we don't fetch from CDN so nothing to patch.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // Vite's esbuild defaults to `target: 'esnext'` which leaves TC39 stage 3
  // decorators (`@Inject(...)`) as raw syntax for the runtime to interpret
  // — no browser ships them natively. Drop the target to a real browser
  // baseline so esbuild downlevels decorators into helper-function calls.
  //
  // `useDefineForClassFields: true` forces `static name = X` to use
  // [[DefineOwnProperty]] semantics. Without it esbuild lowers static
  // fields into `static { this.name = X }` blocks, whose plain assignment
  // hits Function.name's `writable: false` and throws at class init.
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
    'process.env.NODE_ENV': JSON.stringify('development'),
    'process.env.CORDIS_ENV': JSON.stringify('browser'),
    'process.cwd': '() => "/"',
    'process.execArgv': '[]',
  },
  optimizeDeps: {
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
  },
  plugins: [
    vue(),
    yaml(),
    unocss({ presets: [uno({ preflight: false })] }),
    {
      // Rewrite resolved `<pkg>/lib/<x>.{js,cjs,mjs}` to `<pkg>/src/<x>.ts`
      // whenever the TS source exists. Lets workspace packages resolve via
      // their normal `package.json#exports` to `lib/` while still reading
      // live source — no per-package alias needed.
      name: 'cordis-online:workspace-src',
      enforce: 'pre',
      async resolveId(id, importer, opts) {
        // Only bare specifiers (skip relative / abs / virtual / proto).
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
    },
    {
      // `BrowserLoader.import` does `import('/-/modules/<name>')` at runtime
      // (browser can't resolve bare specifiers natively). In dev we just 302
      // to whatever Vite's plugin container resolves `<name>` to (typically
      // `/@fs/<abs-path>`). After redirect, `import.meta.url` and every
      // internal import are in Vite's native form — no parallel URL scheme.
      //
      // In prod the SW intercepts the same URL and serves CDN content; dev
      // and prod share only the entry-point URL `/-/modules/<name>`, not the
      // downstream graph.
      name: 'cordis-online:module-prefix',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
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
    },
    {
      // Inject the same CLIENT_CONFIG global that the prod build inserts —
      // `@cordisjs/client/data.ts` reads it as a `declare const`, so without
      // this every page boot dies with ReferenceError.
      name: 'cordis-online:client-config',
      transformIndexHtml(html) {
        const config = JSON.stringify({
          devMode: true,
          uiPath: '',
          endpoint: '',
          static: true,
          online: { enabled: true },
        })
        return html.replace('</title>', `</title>\n    <script>window.CLIENT_CONFIG = ${config}</script>`)
      },
    },
  ],
})

await server.listen()
server.printUrls()
