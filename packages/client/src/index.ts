import * as vite from 'vite'
import { RollupOutput } from 'rollup'
import { existsSync, promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import unocss from 'unocss/vite'
import uno from 'unocss/preset-uno'
import vue from '@vitejs/plugin-vue'
import yaml from '@maikolib/vite-plugin-yaml'
import { fileURLToPath } from 'node:url'

declare module 'yakumo' {
  interface PackageConfig {
    client?: string
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
          'vue-router',
          '@vueuse/core',
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
        'vue-i18n': '@cordisjs/client',
        '@cordisjs/components': '@cordisjs/client',
      },
    },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
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
    ],
    resolve: {
      dedupe: ['vue', 'vue-demi', 'vue-router', 'element-plus', '@vueuse/core', '@popperjs/core', 'marked', 'xss'],
    },
    optimizeDeps: {
      include: [
        'vue',
        'vue-router',
        'element-plus',
        '@vueuse/core',
        '@popperjs/core',
        'marked',
        'xss',
      ],
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
    },
    build: {
      rollupOptions: {
        input: root + '/index.html',
      },
    },
  } as vite.InlineConfig, config))
}
