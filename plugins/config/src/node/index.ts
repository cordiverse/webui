import { Context, Schema } from 'cordis'
import { resolve } from 'path'
import { PackageProvider } from './packages'
import { ConfigWriter, ServiceProvider } from '../shared'

export * from '../shared'

export const name = 'config'
export const inject = ['console']

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

export function apply(ctx: Context, config: Config) {
  if (!ctx.loader?.writable) {
    return ctx.logger('app').warn('@cordisjs/plugin-config is only available for json/yaml config file')
  }

  ctx.plugin(PackageProvider)
  ctx.plugin(ServiceProvider)
  ctx.plugin(ConfigWriter)

  ctx.console.addEntry({
    dev: resolve(__dirname, '../../client/index.ts'),
    prod: resolve(__dirname, '../../dist'),
  })
}
