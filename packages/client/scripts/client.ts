import { RollupOutput } from 'rollup'
import { appendFile, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as vite from 'vite'
import unocss from 'unocss/vite'
import uno from 'unocss/preset-uno'
import vue from '@vitejs/plugin-vue'
import yaml from '@maikolib/vite-plugin-yaml'

function findModulePath(id: string) {
  const path = fileURLToPath(import.meta.resolve(id)).replace(/\\/g, '/')
  const keyword = `/node_modules/${id}/`
  return path.slice(0, path.indexOf(keyword)) + keyword.slice(0, -1)
}

const cwd = resolve(fileURLToPath(import.meta.url), '../../../..')
const dist = cwd + '/plugins/webui/dist'

export async function build(root: string, config: vite.UserConfig = {}, isClient = false) {
  const { rollupOptions = {} } = config.build || {}
  return await vite.build({
    root,
    build: {
      outDir: cwd + '/plugins/webui/dist',
      emptyOutDir: true,
      cssCodeSplit: false,
      ...config.build,
      rollupOptions: {
        ...rollupOptions,
        makeAbsoluteExternalsRelative: true,
        external: [
          root + '/vue.js',
          root + '/vue-router.js',
          root + '/client.js',
          root + '/vueuse.js',
        ],
        output: {
          format: 'module',
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
          ...rollupOptions.output,
        },
      },
    },
    plugins: [
      vue(),
      yaml(),
      ...config.plugins || [],
    ],
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
    },
    resolve: {
      alias: {
        'vue': root + '/vue.js',
        'vue-router': root + '/vue-router.js',
        '@vueuse/core': root + '/vueuse.js',
        '@cordisjs/client': root + '/client.js',
        ...isClient ? {
          'vue-i18n': findModulePath('vue-i18n') + '/dist/vue-i18n.esm-browser.prod.js',
          '@intlify/core-base': findModulePath('@intlify/core-base') + '/dist/core-base.esm-browser.prod.js',
        } : {
          'vue-i18n': root + '/client.js',
        },
      },
    },
  }) as RollupOutput
}

export default async function () {
  // build for webui main
  const { output } = await build(cwd + '/packages/client/app', {
    plugins: [
      unocss({
        presets: [
          uno({
            preflight: false,
          }),
        ],
      }),
    ],
  })

  await Promise.all([
    copyFile(findModulePath('vue') + '/dist/vue.runtime.esm-browser.prod.js', dist + '/vue.js'),
    build(findModulePath('vue-router') + '/dist', {
      build: {
        outDir: dist,
        emptyOutDir: false,
        rollupOptions: {
          input: {
            'vue-router': findModulePath('vue-router') + '/dist/vue-router.esm-browser.js',
          },
          preserveEntrySignatures: 'strict',
        },
      },
    }),
    build(findModulePath('@vueuse/core'), {
      build: {
        outDir: dist,
        emptyOutDir: false,
        rollupOptions: {
          input: {
            'vueuse': findModulePath('@vueuse/core') + '/index.mjs',
          },
          preserveEntrySignatures: 'strict',
        },
      },
    }),
  ])

  await build(cwd + '/packages/client/client', {
    build: {
      outDir: dist,
      emptyOutDir: false,
      chunkSizeWarningLimit: 1024 * 1024,
      rollupOptions: {
        input: {
          'client': cwd + '/packages/client/client/index.ts',
        },
        output: {
          manualChunks: {
            element: ['element-plus'],
          },
        },
        preserveEntrySignatures: 'strict',
      },
    },
  }, true)

  for (const file of output) {
    if (file.type === 'asset' && file.name === 'style.css') {
      await appendFile(dist + '/style.css', file.source)
    }
  }
}
