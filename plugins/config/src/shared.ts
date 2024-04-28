import { Context, MainScope, Plugin, Schema, ScopeStatus, Service } from 'cordis'
import { Dict } from 'cosmokit'
import { Entry as LoaderEntry } from '@cordisjs/loader'
import { Entry as ClientEntry } from '@cordisjs/plugin-webui'
import { PackageJson, SearchObject } from '@cordisjs/registry'
import {} from '@cordisjs/plugin-hmr'

declare module '@cordisjs/loader' {
  namespace Entry {
    interface Options {
      label?: string | Dict<string>
      collapse?: boolean
    }
  }
}

declare module '@cordisjs/plugin-webui' {
  interface Events {
    'manager.config.list'(): LoaderEntry.Options[]
    'manager.config.create'(options: Omit<LoaderEntry.Options, 'id'> & EntryLocation): Promise<string>
    'manager.config.update'(options: Omit<LoaderEntry.Options, 'id' | 'name'>): void
    'manager.config.remove'(options: { id: string }): void
    'manager.config.teleport'(options: { id: string } & EntryLocation): void
    'manager.package.list'(): Promise<PackageProvider.Data[]>
    'manager.package.runtime'(name: string): Promise<PackageProvider.RuntimeData>
    'manager.service.list'(): Dict<string[]>
  }
}

export interface Data {
  config: LoaderEntry.Options[]
  packages: Dict<PackageProvider.Data>
  services: Dict<string[]>
}

interface EntryLocation {
  parent?: string
  position?: number
}

export default abstract class Manager extends Service {
  static inject = ['loader']

  entry?: ClientEntry
  cache: Dict<PackageProvider.RuntimeData> = {}
  debouncedRefresh: () => void

  store = new WeakMap<Plugin, string>()

  constructor(public ctx: Context) {
    super(ctx, 'manager', true)

    if (!ctx.loader?.writable) {
      throw new Error('@cordisjs/plugin-config is only available for json/yaml config file')
    }

    this.debouncedRefresh = ctx.debounce(() => this.entry?.refresh(), 0)
    this.installWebUI()
  }

  getConfig() {
    return this.ctx.loader.config
  }

  getServices() {
    const result = {} as Dict<string[]>
    for (const [name, { type }] of Object.entries(this.ctx.root[Context.internal])) {
      if (type !== 'service') continue
      const instance = this.ctx.get(name)
      if (!(instance instanceof Object)) continue
      const ctx: Context = Reflect.getOwnPropertyDescriptor(instance, Context.current)?.value
      if (!ctx) continue
      result[name] = this.ctx.loader.paths(ctx.scope)
    }
    return result
  }

  installWebUI() {
    this.ctx.inject(['webui'], (ctx) => {
      this.entry = ctx.webui.addEntry({
        dev: import.meta.resolve('../client/index.ts'),
        prod: [
          import.meta.resolve('../dist/index.js'),
          import.meta.resolve('../dist/style.css'),
        ],
      }, async () => ({
        config: this.getConfig(),
        packages: await this.getPackages(),
        services: this.getServices(),
      }))

      ctx.on('config', () => this.entry?.refresh())
      ctx.on('internal/service', () => this.entry?.refresh())

      ctx.on('internal/runtime', scope => this.update(scope.runtime.plugin))
      ctx.on('internal/fork', scope => this.update(scope.runtime.plugin))
      ctx.on('internal/status', scope => this.update(scope.runtime.plugin))
      ctx.on('hmr/reload', (reloads) => {
        for (const [plugin] of reloads) {
          this.update(plugin)
        }
      })

      ctx.webui.addListener('manager.config.list', () => {
        return this.getConfig()
      })

      ctx.webui.addListener('manager.config.create', (options) => {
        const { parent, position, ...rest } = options
        return ctx.loader.create(rest, parent, position)
      })

      ctx.webui.addListener('manager.config.update', (options) => {
        throw new Error('Not implemented')
      })

      ctx.webui.addListener('manager.config.remove', (options) => {
        return ctx.loader.remove(options.id)
      })

      ctx.webui.addListener('manager.config.teleport', (options) => {
        throw new Error('Not implemented')
      })

      ctx.webui.addListener('manager.package.list', () => {
        return this.getPackages()
      })

      ctx.webui.addListener('manager.package.runtime', async (name) => {
        this.cache[name] = await this.parseExports(name)
        this.entry?.refresh()
        return this.cache[name]
      })

      ctx.webui.addListener('manager.service.list', () => {
        return this.getServices()
      })
    })
  }

  abstract collect(forced: boolean): Promise<PackageProvider.Data[]>

  async update(plugin: Plugin) {
    const name = this.store.get(plugin)
    if (!name || !this.cache[name]) return
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

  async getPackages(forced = false) {
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
      const result: PackageProvider.RuntimeData = { id: null }
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
      this.ctx.logger.warn('failed to load %c', name)
      this.ctx.logger.warn(error)
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
    id?: number | null
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
