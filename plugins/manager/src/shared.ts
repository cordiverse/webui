import { Context, Inject, MainScope, Plugin, Schema, ScopeStatus, Service } from 'cordis'
import { readFile } from 'fs/promises'
import { Dict, pick } from 'cosmokit'
import { EntryOptions } from 'cordis/loader'
import { Entry as ClientEntry } from '@cordisjs/plugin-webui'
import { Dependency, LocalObject } from '@cordisjs/registry'
import {} from '@cordisjs/plugin-hmr'

declare module 'cordis' {
  interface Context {
    _manager: Manager
  }
}

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
    'manager.config.eval'(options: { id: string; expr: string; schema: Schema }): Promise<EvalResult>
    'manager.dependency.list'(): Promise<Dependency[]>
    'manager.package.list'(): Promise<LocalObject[]>
    'manager.package.runtime'(options: { name: string }): Promise<RuntimeData | null>
    'manager.package.readme'(options: { name: string; locale: string }): Promise<string | null>
    'manager.service.list'(): Promise<Dict<ServiceData>>
  }
}

declare module '@cordisjs/registry' {
  interface LocalObject {
    runtime?: RuntimeData | null
    readme?: Dict<string | null>
  }
}

export interface EvalResult {
  error?: 'syntax' | 'evaluation' | 'validation' | 'serialization'
  value?: any
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

  public entry?: ClientEntry<Data>

  protected packages: Dict<LocalObject> = Object.create(null)

  private plugins = new WeakMap<Plugin, string>()
  private pending = new Set<string>()
  private flushTimer?: NodeJS.Timeout

  constructor(public ctx: Context) {
    super(ctx, '_manager', true)
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
    const key = ctx[Context.isolate][name]
    const item = ctx[Context.store][key]
    // FIXME
    // 1. check `item` instead of `item?.source`
    // 2. experimental `schema`
    if (!item?.source) return
    const location = this.ctx.loader.locate(item.source)
    const schema = Reflect.getOwnPropertyDescriptor(item.value, 'schema')?.value
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

  @Inject(['webui'])
  injectWebUI() {
    this.entry = this.ctx.webui.addEntry({
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

    const updateEntries = this.ctx.debounce(() => {
      this.entry?.patch({ entries: this.getEntries() })
    }, 0)

    this.ctx.on('loader/config-update', updateEntries)

    this.ctx.on('internal/service', this.ctx.debounce(() => {
      this.entry?.patch({ services: this.getServices() })
    }, 0))

    this.ctx.on('internal/runtime', scope => this.updateRuntime(scope.runtime))
    this.ctx.on('internal/fork', scope => this.updateRuntime(scope.runtime))
    this.ctx.on('internal/status', updateEntries)

    this.ctx.on('hmr/reload', (reloads) => {
      reloads.forEach((_, plugin) => this.updatePlugin(plugin))
    })

    this.ctx.webui.addListener('manager.config.list', () => {
      return this.getEntries()
    })

    this.ctx.webui.addListener('manager.config.create', (options) => {
      const { parent, position, ...rest } = options
      return this.ctx.loader.create(rest, parent, position)
    })

    this.ctx.webui.addListener('manager.config.update', (options) => {
      const { id, parent, position, ...rest } = options
      return this.ctx.loader.update(id, rest, parent, position)
    })

    this.ctx.webui.addListener('manager.config.remove', (options) => {
      return this.ctx.loader.remove(options.id)
    })

    this.ctx.webui.addListener('manager.config.eval', async ({ id, expr, schema }) => {
      const entry = this.ctx.loader.resolve(id)
      schema = Schema(schema)
      let value: any
      try {
        value = entry.evaluate(expr)
      } catch (error) {
        if (error instanceof SyntaxError) return { error: 'syntax' }
        return { error: 'evaluation' }
      }
      try {
        value = schema(value)
      } catch (error) {
        return { error: 'validation' }
      }
      try {
        JSON.stringify(value)
      } catch (error) {
        return { error: 'serialization' }
      }
      return { value }
    })

    this.ctx.webui.addListener('manager.dependency.list', async () => {
      return await this.getDependencies()
    })

    this.ctx.webui.addListener('manager.package.list', async () => {
      return await this.getPackages()
    })

    this.ctx.webui.addListener('manager.package.runtime', async ({ name }) => {
      let runtime = this.packages[name]?.runtime
      if (runtime !== undefined) return runtime
      runtime = await this.parseExports(name)
      if (this.packages[name]) {
        this.packages[name].runtime = runtime
        this.flushPackage(name)
      }
      return runtime
    })

    this.ctx.webui.addListener('manager.package.readme', async ({ name, locale }) => {
      const files = this.packages[name]?._readmeFiles
      if (!files) return null
      if (!files[locale]) return null
      if (typeof files[locale] === 'string') {
        files[locale] = readFile(files[locale], 'utf8')
        files[locale].then((content) => {
          if (this.packages[name]?._readmeFiles !== files) return
          this.packages[name].readme![locale] = content
          this.flushPackage(name)
        })
      }
      return files[locale]
    })

    this.ctx.webui.addListener('manager.service.list', async () => {
      return this.getServices()
    })
  }

  abstract getPackages(): Promise<LocalObject[]>
  abstract getDependencies(): Promise<Dependency[]>

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
