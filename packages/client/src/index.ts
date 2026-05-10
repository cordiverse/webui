import * as vite from 'vite'
import { RollupOutput } from 'rollup'
import { existsSync, promises as fs } from 'node:fs'
import unocss from 'unocss/vite'
import uno from 'unocss/preset-uno'
import vue from '@vitejs/plugin-vue'
import yaml from '@cordisjs/unyaml/vite'

declare module 'yakumo' {
  interface PackageConfig {
    client?: string
  }
}

const DEPRECATED_ALIASES = {
  'vue-router': '@cordisjs/client',
}

function deprecatedAliases(): vite.Plugin {
  const seen = new Set<string>()
  return {
    name: 'cordis:deprecated-aliases',
    enforce: 'pre',
    async resolveId(id, importer, options) {
      const target = DEPRECATED_ALIASES[id]
      if (!target) return
      const key = `${id}\0${importer ?? ''}`
      if (!seen.has(key)) {
        seen.add(key)
        const where = importer ? ` (in ${importer})` : ''
        this.warn(`import from '${id}' is deprecated, use '${target}' instead${where}`)
      }
      return this.resolve(target, importer, { skipSelf: true, ...options })
    },
  }
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
      deprecatedAliases(),
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

export async function createServer(config: InlineConfig) {
  return vite.createServer(vite.mergeConfig({
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
    ],
    resolve: {
      dedupe: ['path-to-regexp', 'vue', 'vue-demi', 'element-plus', '@vueuse/core', '@popperjs/core', 'marked', 'xss'],
    },
    optimizeDeps: {
      include: [
        'path-to-regexp',
        'vue',
        'vue-demi',
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
  } as vite.InlineConfig, config))
}
