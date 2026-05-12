import { Context } from 'cordis'
import { Dict } from 'cosmokit'
import type {} from '@cordisjs/plugin-webui'
import type { DependencyMetaKey, RemotePackage } from './types.ts'
import z from 'schemastery'
import Installer, { Dependency } from './installer.ts'
import Market, { MarketData } from './market.ts'

export * from './installer.ts'
export * from './market.ts'
export * from './types.ts'

export interface DescribeResult {
  name: string
  latest: string
  description?: string
  versions: string[]
}

export interface Data {
  market: MarketData
  dependencies: Dict<Dependency>
  refresh(): Promise<void>
  install(deps: Dict<string | null>, forced?: boolean): Promise<number>
  registry(names: string[]): Promise<Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>>>
  listDependencies(): Promise<Dict<Dependency>>
  describe(name: string): Promise<DescribeResult | null>
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
    const refreshDeps = async () => {
      const dependencies = await ctx.installer.getDeps().catch(() => ({}))
      entry.mutate((d) => {
        d.dependencies = dependencies
      })
    }

    const entry = ctx.webui.addEntry<Data>({
      baseUrl: import.meta.url,
      source: '../client/index.ts',
      manifest: '../dist/manifest.json',
      routes: ['/market', '/dependencies'],
    }, {
      market: ctx.market.snapshot(),
      dependencies: {},
      async refresh() {
        await ctx.market.refresh(true)
      },
      async install(deps, forced) {
        const code = await ctx.installer.install(deps, forced)
        await refreshDeps()
        return code
      },
      async registry(names) {
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
      },
      async listDependencies() {
        return ctx.installer.getDeps()
      },
      async describe(name) {
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
          ctx.logger.warn('describe %C: %s', name, error?.message ?? error)
          return null
        }
      },
    })

    const refreshMarket = () => {
      entry.mutate((d) => {
        d.market = ctx.market.snapshot()
      })
    }

    refreshDeps()

    ctx.effect(() => ctx.market.subscribe(refreshMarket))
  })
}
