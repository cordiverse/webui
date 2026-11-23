import { defineConfig } from 'oxlint'
import base from '@cordisjs/oxlint-config'

export default defineConfig({
  ...base,
  env: {
    ...base.env,
    browser: true,
  },
  globals: {
    CLIENT_CONFIG: 'readonly',
  },
  overrides: [
    {
      // browser code reports to the developer console
      files: ['packages/*/app/**', 'packages/*/client/**', 'plugins/*/client/**'],
      rules: {
        'no-console': 'off',
      },
    },
    {
      files: ['packages/online/**'],
      rules: {
        'no-alert': 'off',
        'no-console': 'off',
      },
    },
  ],
})
