import { Context } from 'cordis'
import type {} from '@cordisjs/plugin-webui'
import z from 'schemastery'

export const name = 'webui-sso'

export const inject = ['webui']

export interface Config {}

export const Config: z<Config> = z.object({})

export function apply(ctx: Context) {
  ctx.webui.addEntry({
    path: '@cordisjs/plugin-webui-sso/dist',
    base: import.meta.url,
    dev: '../client/index.ts',
    prod: '../dist/manifest.json',
  })
}
