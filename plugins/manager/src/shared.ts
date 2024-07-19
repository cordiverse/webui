import { Context, Inject, MainScope, Plugin, Schema, ScopeStatus, Service } from 'cordis'
import { Dict, pick } from 'cosmokit'
import { EntryOptions } from 'cordis/loader'
import { Entry as ClientEntry } from '@cordisjs/plugin-webui'
import { LocalObject } from '@cordisjs/registry'
import {} from '@cordisjs/plugin-hmr'

declare module 'cordis/loader' {
  interface EntryOptions {
    label?: string | null
    collapse?: boolean | null
  }
}

declare module '@cordisjs/plugin-webui' {
  interface Events {
    'manager.config.list'(): EntryData[]
    'manager.config.create'(options: Omit<EntryOptions, 'id'> & EntryLocation): Promise<string>
    'manager.config.update'(options: Omit<EntryOptions, 'name'> & EntryLocation): void
    'manager.config.remove'(options: { id: string }): void
    'manager.package.list'(): Promise<LocalObject[]>
    'manager.package.runtime'(options: { name: string }): Promise<RuntimeData | null>
    'manager.service.list'(): Promise<Dict<ServiceData>>
  }
}

declare module '@cordisjs/registry' {
  interface LocalObject {
    runtime?: RuntimeData | null
  }
}

export interface EntryData extends EntryOptions, Required<EntryLocation> {
  isGroup?: boolean
  status?: ScopeStatus
}

export interface ServiceInfo {
  location?: string[]
  schema?: Schema
}

export interface ServiceData {
  root?: ServiceInfo
  local: Dict<ServiceInfo>
  global: Dict<ServiceInfo>
}

export interface Data {
  entries: EntryData[]
  packages: Dict<LocalObject>
  services: Dict<ServiceData>
}

export interface RuntimeData {
  id?: number | null
  filter?: boolean // FIXME
  forkable?: boolean
  schema?: Schema
  usage?: string
  inject?: Dict<Inject.Meta>
}

export interface EntryLocation {
  parent?: string | null
  position?: number
}

export abstract class Manager extends Service {
  static inject = ['loader']

  entry?: ClientEntry
  packages: Dict<LocalObject> = Object.create(null)
  plugins = new WeakMap<Plugin, string>()

  pending = new Set<string>()
  flushTimer?: NodeJS.Timeout

  constructor(public ctx: Context) {
    super(ctx, 'manager', true)
  }

  getEntries() {
    return [...this.ctx.loader.entries()].map<EntryData>((entry) => ({
      ...entry.options,
      id: entry.id,
      config: entry.subgroup?.data === entry.options.config ? undefined : entry.options.config,
      parent: entry.parent.ctx.scope.entry?.id ?? null,
      position: entry.parent.data.indexOf(entry.options),
      isGroup: !!entry.subgroup,
      status: entry.fork?.status,
    }))
  }

  private getServiceInfo(ctx: Context, name: string) {
    const instance = ctx.get(name)
    if (!(instance instanceof Object)) return
    const origin: Context = Reflect.getOwnPropertyDescriptor(instance, Context.current)?.value
    if (!origin) return
    const location = this.ctx.loader.locate(origin)
    const schema = Reflect.getOwnPropertyDescriptor(instance, 'schema')?.value
    return { location, schema } as ServiceInfo
  }

  getServices() {
    const result = Object.create(null) as Dict<ServiceData>
    for (const [name, { type }] of Object.entries(this.ctx.root[Context.internal])) {
      if (type !== 'service') continue
      result[name] = {
        root: this.getServiceInfo(this.ctx.root, name),
        local: {},
        global: {},
      }
    }
    for (const entry of this.ctx.loader.entries()) {
      if (!entry.options.isolate) continue
      for (const [name, value] of Object.entries(entry.options.isolate)) {
        if (!result[name]) continue
        if (value === true) {
          result[name].local[entry.id] = this.getServiceInfo(entry.ctx, name)!
        } else {
          result[name].global[value] = this.getServiceInfo(entry.ctx, name)!
        }
      }
    }
    return result
  }

  start() {
    this.ctx.inject(['webui'], (ctx) => {
      this.entry = ctx.webui.addEntry({
        base: import.meta.url,
        dev: '../client/index.ts',
        prod: [
          '../dist/index.js',
          '../dist/style.css',
        ],
      }, () => (this.getPackages(), {
        entries: this.getEntries(),
        packages: this.packages,
        services: this.getServices(),
      }))

      ctx.on('loader/config-update', ctx.debounce(() => {
        this.entry?.patch({ entries: this.getEntries() })
      }, 0))

      ctx.on('internal/service', ctx.debounce(() => {
        this.entry?.patch({ services: this.getServices() })
      }, 0))

      ctx.on('internal/runtime', scope => this.updateRuntime(scope.runtime))
      ctx.on('internal/fork', scope => this.updateRuntime(scope.runtime))
      ctx.on('internal/status', scope => this.updateRuntime(scope.runtime))

      ctx.on('hmr/reload', (reloads) => {
        reloads.forEach((_, plugin) => this.updatePlugin(plugin))
      })

      ctx.webui.addListener('manager.config.list', () => {
        return this.getEntries()
      })

      ctx.webui.addListener('manager.config.create', (options) => {
        const { parent, position, ...rest } = options
        return ctx.loader.create(rest, parent, position)
      })

      ctx.webui.addListener('manager.config.update', (options) => {
        const { id, parent, position, ...rest } = options
        return ctx.loader.update(id, rest, parent, position)
      })

      ctx.webui.addListener('manager.config.remove', (options) => {
        return ctx.loader.remove(options.id)
      })

      ctx.webui.addListener('manager.package.list', async () => {
        return await this.getPackages()
      })

      ctx.webui.addListener('manager.package.runtime', async (options) => {
        let runtime = this.packages[options.name]?.runtime
        if (runtime !== undefined) return runtime
        runtime = await this.parseExports(options.name)
        if (this.packages[options.name]) {
          this.packages[options.name].runtime = runtime
          this.flushPackage(options.name)
        }
        return runtime
      })

      ctx.webui.addListener('manager.service.list', async () => {
        return this.getServices()
      })
    })
  }

  abstract getPackages(forced?: boolean): Promise<LocalObject[]>

  flushPackage(name: string) {
    this.pending.add(name)
    this.flushTimer ??= setTimeout(() => {
      this.entry?.patch(pick(this.packages, this.pending), 'packages')
      this.pending.clear()
      this.flushTimer = undefined
    }, 100)
  }

  async updatePlugin(plugin: Plugin) {
    const name = this.plugins.get(plugin)
    if (!name || !this.packages[name].runtime) return
    this.packages[name].runtime = await this.parseExports(name)
    this.flushPackage(name)
  }

  updateRuntime(main: MainScope) {
    const name = this.plugins.get(main.plugin)
    if (!name || !this.packages[name].runtime) return
    this.parseRuntime(main, this.packages[name].runtime!)
    this.flushPackage(name)
  }

  parseRuntime(main: MainScope, runtime: RuntimeData) {
    runtime.id = main.uid
    runtime.forkable = main.isForkable
  }

  async parseExports(name: string) {
    try {
      const exports = await this.ctx.loader.import(name)
      const plugin = this.ctx.loader.unwrapExports(exports)
      if (plugin) this.plugins.set(plugin, name)
      const result: RuntimeData = { id: null, inject: {} }
      result.schema = plugin?.Config || plugin?.schema
      result.usage = plugin?.usage
      result.filter = plugin?.filter
      result.inject = Inject.resolve(plugin?.using || plugin?.inject)

      // make sure that result can be serialized into json
      JSON.stringify(result)

      if (plugin) {
        const runtime = this.ctx.registry.get(plugin)
        if (runtime) this.parseRuntime(runtime, result)
      }
      return result
    } catch (error) {
      this.ctx.logger.warn('failed to load %c', name)
      this.ctx.logger.warn(error)
      return null
    }
  }
}

export namespace Manager {
  export interface Config {}

  export const Config: Schema<Config> = Schema.object({})
}
