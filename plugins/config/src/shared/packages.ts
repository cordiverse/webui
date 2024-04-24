import { Context, Logger, MainScope, Plugin, Schema, ScopeStatus } from 'cordis'
import { Dict } from 'cosmokit'
import { DataService } from '@cordisjs/webui'
import { PackageJson, SearchObject, SearchResult } from '@cordisjs/registry'
import {} from '@cordisjs/plugin-hmr'

declare module '@cordisjs/loader' {
  interface Loader {
    market: SearchResult
  }
}

declare module '@cordisjs/webui' {
  interface Events {
    'config/request-runtime'(name: string): void
  }
}

const logger = new Logger('config')

export abstract class PackageProvider extends DataService<Dict<PackageProvider.Data>> {
  cache: Dict<PackageProvider.RuntimeData> = {}
  debouncedRefresh: () => void

  store = new WeakMap<Plugin, string>()

  constructor(public ctx: Context) {
    super(ctx, 'packages', { authority: 4 })

    this.debouncedRefresh = ctx.debounce(() => this.refresh(false), 0)
    ctx.on('internal/runtime', scope => this.update(scope.runtime.plugin))
    ctx.on('internal/fork', scope => this.update(scope.runtime.plugin))
    ctx.on('internal/status', scope => this.update(scope.runtime.plugin))
    ctx.on('hmr/reload', (reloads) => {
      for (const [plugin] of reloads) {
        this.update(plugin)
      }
    })

    ctx.console.addListener('config/request-runtime', async (name) => {
      this.cache[name] = await this.parseExports(name)
      this.refresh(false)
    }, { authority: 4 })
  }

  abstract collect(forced: boolean): Promise<PackageProvider.Data[]>

  async update(plugin: Plugin) {
    const name = this.store.get(plugin)
    if (!this.cache[name]) return
    this.cache[name] = await this.parseExports(name)
    this.debouncedRefresh()
  }

  parseRuntime(state: MainScope, result: PackageProvider.RuntimeData) {
    result.id = state.runtime.uid
    result.forkable = state.runtime.isForkable
    result.forks = Object.fromEntries(state.children
      .filter(fork => fork.entry)
      .map(fork => [fork.entry!.options.id, { status: fork.status }]))
  }

  async get(forced = false) {
    const objects = (await this.collect(forced)).slice()
    for (const object of objects) {
      object.name = object.package?.name || ''
      if (!this.cache[object.name]) continue
      object.runtime = this.cache[object.name]
    }

    return Object.fromEntries(objects.map(data => [data.name, data]))
  }

  async parseExports(name: string) {
    try {
      const exports = await this.ctx.loader.resolve(name)
      if (exports) this.store.set(exports, name)
      const result: PackageProvider.RuntimeData = {}
      result.schema = exports?.Config || exports?.schema
      result.usage = exports?.usage
      result.filter = exports?.filter
      const inject = exports?.using || exports?.inject || []
      if (Array.isArray(inject)) {
        result.required = inject
        result.optional = []
      } else {
        result.required = inject.required || []
        result.optional = inject.optional || []
      }

      // make sure that result can be serialized into json
      JSON.stringify(result)

      if (exports) {
        const runtime = this.ctx.registry.get(exports)
        if (runtime) this.parseRuntime(runtime, result)
      }
      return result
    } catch (error) {
      logger.warn('failed to load %c', name)
      logger.warn(error)
      return { failed: true }
    }
  }
}

export namespace PackageProvider {
  export interface Data extends Pick<SearchObject, 'shortname' | 'workspace' | 'manifest' | 'portable'> {
    name?: string
    runtime?: RuntimeData
    package: Pick<PackageJson, 'name' | 'version' | 'peerDependencies' | 'peerDependenciesMeta'>
  }

  export interface RuntimeData {
    id?: number
    filter?: boolean
    forkable?: boolean
    schema?: Schema
    usage?: string
    required?: string[]
    optional?: string[]
    failed?: boolean
    forks?: Dict<{
      status?: ScopeStatus
    }>
  }
}
