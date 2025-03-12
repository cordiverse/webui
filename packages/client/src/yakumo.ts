import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from 'yakumo'
import { build } from '.'
import {} from 'yakumo-esbuild'
import type { UserConfig } from 'vite'

export const inject = ['yakumo']

export function apply(ctx: Context) {
  ctx.register('client', async () => {
    const paths = ctx.yakumo.locate(ctx.yakumo.argv._)
    if (!paths.length) return

    for (const path of paths) {
      const meta = ctx.yakumo.workspaces[path]
      const deps = {
        ...meta.dependencies,
        ...meta.devDependencies,
        ...meta.peerDependencies,
        ...meta.optionalDependencies,
      }
      let config: UserConfig = {}
      if (meta.yakumo?.client) {
        const filename = pathToFileURL(resolve(ctx.yakumo.cwd + path, meta.yakumo.client)).href
        const exports = (await import(filename)).default
        if (typeof exports === 'function') {
          await exports()
          continue
        }
        config = exports
      } else if (!deps['@cordisjs/client']) {
        continue
      }
      await build(ctx.yakumo.cwd + path, config)
    }
  })
}
