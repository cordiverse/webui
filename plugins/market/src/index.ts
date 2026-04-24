import { Context } from 'cordis'
import { Dict } from 'cosmokit'
import type {} from '@cordisjs/plugin-webui'
import type { DependencyMetaKey, RemotePackage } from '@cordisjs/registry'
import z from 'schemastery'
import Installer, { Dependency } from './installer.ts'
import Market, { MarketData } from './market.ts'

export * from './installer.ts'
export * from './market.ts'

declare module '@cordisjs/plugin-webui' {
  interface Events {
    'market/refresh'(): Promise<void>
    'market/install'(deps: Dict<string | null>, forced?: boolean): Promise<number>
    'market/registry'(names: string[]): Promise<Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>>>
    'market/describe'(name: string): Promise<DescribeResult | null>
    'market/dependency/list'(): Promise<Dict<Dependency>>
  }
}

export interface DescribeResult {
  name: string
  latest: string
  description?: string
  versions: string[]
}

export interface Data {
  market: MarketData
  dependencies: Dict<Dependency>
}

export const name = 'market'
export const inject = ['http', 'webui']

export interface Config {
  endpoint: string
  timeout: number
  ttl: number
  registry?: Installer.Config
}

export const Config: z<Config> = z.intersect([
  Market.Config,
  z.object({
    registry: Installer.Config.description('npm 源与安装设置。'),
  }),
])

export function apply(ctx: Context, config: Config) {
  ctx.plugin(Installer, config.registry ?? {})
  ctx.plugin(Market, config)

  ctx.inject(['installer', 'market'], (ctx) => {
    let dependencies: Dict<Dependency> = {}

    const entry = ctx.webui.addEntry<Data>({
      path: '@cordisjs/plugin-market/dist',
      base: import.meta.url,
      dev: '../client/index.ts',
      prod: '../dist/manifest.json',
    }, () => ({
      market: ctx.market.snapshot(),
      dependencies,
    }))

    const refreshDeps = async () => {
      dependencies = await ctx.installer.getDeps().catch(() => ({}))
      entry.refresh()
    }

    refreshDeps()

    ctx.effect(() => ctx.market.subscribe(() => entry.refresh()))

    ctx.webui.addListener('market/refresh', async () => {
      await ctx.market.refresh(true)
    })

    ctx.webui.addListener('market/install', async (deps, forced) => {
      const code = await ctx.installer.install(deps, forced)
      await refreshDeps()
      return code
    })

    ctx.webui.addListener('market/registry', async (names) => {
      const result = await Promise.all(names.map(async (name) => {
        const versions = await ctx.installer.getPackage(name)
        if (!versions) return [name, {}] as const
        const trimmed: Dict<Pick<RemotePackage, DependencyMetaKey>> = {}
        for (const [version, remote] of Object.entries(versions)) {
          trimmed[version] = {
            deprecated: remote.deprecated,
            peerDependencies: remote.peerDependencies,
            peerDependenciesMeta: remote.peerDependenciesMeta,
          }
        }
        return [name, trimmed] as const
      }))
      return Object.fromEntries(result)
    })

    ctx.webui.addListener('market/dependency/list', async () => {
      return ctx.installer.getDeps()
    })

    ctx.webui.addListener('market/describe', async (name) => {
      try {
        const registry = await ctx.http.get<any>(`${ctx.installer.endpoint}/${name}`, {
          timeout: config.registry?.timeout ?? config.timeout,
        })
        const latest = registry['dist-tags']?.latest
        if (!latest) return null
        return {
          name: registry.name,
          latest,
          description: registry.description,
          versions: Object.keys(registry.versions ?? {}).reverse(),
        }
      } catch (error: any) {
        ctx.logger.warn('describe %c: %s', name, error?.message ?? error)
        return null
      }
    })
  })
}
