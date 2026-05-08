import * as vite from 'vite'
import { RollupOutput } from 'rollup'
import { existsSync, promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import unocss from 'unocss/vite'
import uno from 'unocss/preset-uno'
import vue from '@vitejs/plugin-vue'
import yaml from '@cordisjs/unyaml/vite'
import { fileURLToPath } from 'node:url'

declare module 'yakumo' {
  interface PackageConfig {
    client?: string
  }
}

// Vite plugin: warns once per importer when a deprecated specifier is hit and
// then defers to the resolve.alias config to actually rewrite the import.
function deprecatedAliases(aliases: Record<string, string>): vite.Plugin {
  const seen = new Set<string>()
  return {
    name: 'cordis:deprecated-aliases',
    enforce: 'pre',
    resolveId(id, importer) {
      const target = aliases[id]
      if (!target) return
      const key = `${id}\0${importer ?? ''}`
      if (seen.has(key)) return
      seen.add(key)
      const where = importer ? ` (in ${importer})` : ''
      this.warn(`import from '${id}' is deprecated${where}; use '${target}' instead.`)
    },
  }
}

const COMPAT_ALIASES = {
  'vue-router': '@cordisjs/client',
}

export async function build(root: string, config: vite.UserConfig = {}) {
  if (!existsSync(root + '/client')) return

  const outDir = root + '/dist'
  if (existsSync(outDir)) {
    await fs.rm(outDir, { recursive: true })
  }
  await fs.mkdir(root + '/dist', { recursive: true })

  const results = await vite.build(vite.mergeConfig({
    root,
    build: {
      write: false,
      outDir: 'dist',
      assetsDir: '',
      minify: true,
      emptyOutDir: true,
      commonjsOptions: {
        strictRequires: true,
      },
      lib: {
        entry: root + '/client/index.ts',
        fileName: '[name]-[hash]',
        cssFileName: 'index',
        formats: ['es'],
      },
      manifest: 'manifest.json',
      rollupOptions: {
        makeAbsoluteExternalsRelative: true,
        external: [
          'vue',
          '@cordisjs/client',
        ],
        output: {
          format: 'iife',
          assetFileNames: '[name]-[hash][extname]',
          hashCharacters: 'base36',
        },
      },
    },
    plugins: [
      vue(),
      yaml(),
      unocss({
        presets: [
          uno({
            preflight: false,
          }),
        ],
      }),
      deprecatedAliases(COMPAT_ALIASES),
      {
        name: 'auto-import',
        transform(code, id, options) {
          if (id !== root + '/client/index.ts') return
          code = 'import "virtual:uno.css";\n\n' + code
          return { code, map: null }
        },
      },
    ],
    resolve: {
      alias: {
        '@cordisjs/components': '@cordisjs/client',
        // Compat shim — see deprecatedAliases plugin above for the warning.
        ...COMPAT_ALIASES,
      },
    },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  } as vite.InlineConfig, config)) as RollupOutput[]

  let manifest: vite.Manifest | undefined
  for (const item of results[0].output) {
    const dest = root + '/dist/' + item.fileName
    if (item.type === 'asset') {
      await fs.writeFile(dest, item.source)
    } else {
      const result = await vite.transformWithEsbuild(item.code, dest, {
        minifyWhitespace: true,
        charset: 'utf8',
      })
      await fs.writeFile(dest, result.code)
    }
  }
  return manifest
}

export interface InlineConfig extends vite.InlineConfig {}

export async function createServer(baseDir: string, config: InlineConfig = {}) {
  const root = resolve(fileURLToPath(import.meta.url), '../../app')
  return vite.createServer(vite.mergeConfig({
    root,
    base: '/vite/',
    server: {
      middlewareMode: true,
      fs: {
        allow: [baseDir],
      },
    },
    plugins: [
      vue(),
      yaml(),
      unocss({
        presets: [
          uno({
            preflight: false,
          }),
        ],
      }),
      deprecatedAliases(COMPAT_ALIASES),
    ],
    resolve: {
      // Compat shim — see deprecatedAliases plugin above for the warning.
      alias: { ...COMPAT_ALIASES },
      dedupe: ['vue', 'vue-demi', 'element-plus', '@vueuse/core', '@popperjs/core', 'marked', 'xss'],
    },
    optimizeDeps: {
      include: [
        'vue',
        'element-plus',
        '@vueuse/core',
        '@popperjs/core',
        'marked',
        'xss',
      ],
      exclude: [
        '@cordisjs/muon',
      ],
    },
    build: {
      rollupOptions: {
        input: root + '/index.html',
      },
    },
  } as vite.InlineConfig, config))
}
