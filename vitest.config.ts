import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import yaml from '@cordisjs/unyaml/vite'
import unocss from 'unocss/vite'
import uno from 'unocss/preset-uno'
import { fileURLToPath } from 'node:url'

const clientShim = fileURLToPath(new URL('./tests/shims/cordisjs-client.ts', import.meta.url))
const setupClient = fileURLToPath(new URL('./tests/setup-client.ts', import.meta.url))

export default defineConfig({
  plugins: [
    vue(),
    yaml(),
    unocss({ presets: [uno({ preflight: false })] }),
  ],
  resolve: {
    alias: [
      // Client-side webui tests never want to trigger the full `@cordisjs/client`
      // bootstrap (Vue app, real vue-router, service singletons mounting to #app).
      // Redirect the bare specifier to a shim that re-exports cordis/cosmokit/schemastery
      // and stubs the browser-only helpers (send, useContext, useMenu, …).
      // Does not affect tests that don't import `@cordisjs/client` (e.g. market server E2E).
      { find: /^@cordisjs\/client$/, replacement: clientShim },
    ],
  },
  test: {
    setupFiles: [setupClient],
    server: {
      deps: {
        inline: ['element-plus', '@cordisjs/components'],
      },
    },
  },
})
