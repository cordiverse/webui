import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from 'yakumo'
import type {} from '@cordisjs/plugin-cli'
import { build } from '.'
import {} from 'yakumo-esbuild'
import type { UserConfig } from 'vite'

export const inject = ['yakumo', 'cli']

export function apply(ctx: Context) {
  ctx.cli
    .command('client')
    .action(async ({ args }) => {
      await ctx.yakumo.initialize()
      const paths = ctx.yakumo.locate(args)
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
