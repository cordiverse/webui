import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import yaml from '@cordisjs/unyaml/vite'
import unocss from 'unocss/vite'
import uno from 'unocss/preset-uno'
import { fileURLToPath } from 'node:url'

const setupClient = fileURLToPath(new URL('./tests/setup-client.ts', import.meta.url))

export default defineConfig({
  plugins: [
    vue(),
    yaml(),
    unocss({ presets: [uno({ preflight: false })] }),
  ],
  test: {
    setupFiles: [setupClient],
    server: {
      deps: {
        inline: ['element-plus', '@cordisjs/components'],
      },
    },
  },
})
