import { Context, MainScope, Plugin, Schema, ScopeStatus, Service } from 'cordis'
import { Dict, pick } from 'cosmokit'
import { Entry as LoaderEntry } from '@cordisjs/loader'
import { Entry as ClientEntry } from '@cordisjs/plugin-webui'
import { LocalObject } from '@cordisjs/registry'
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
    'manager.config.update'(options: Omit<LoaderEntry.Options, 'name'>): void
    'manager.config.remove'(options: { id: string }): void
    'manager.config.teleport'(options: { id: string } & EntryLocation): void
    'manager.package.list'(): Promise<LocalObject[]>
    'manager.package.runtime'(name: string): Promise<RuntimeData>
    'manager.service.list'(): Dict<string[]>
  }
}

declare module '@cordisjs/registry' {
  interface LocalObject {
    runtime?: RuntimeData
  }
}

export interface Data {
  config: LoaderEntry.Options[]
  packages: Dict<LocalObject>
  services: Dict<string[]>
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

interface EntryLocation {
  parent?: string
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

    if (!ctx.loader?.writable) {
      throw new Error('@cordisjs/plugin-config is only available for json/yaml config file')
    }
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

  start() {
    this.ctx.inject(['webui'], (ctx) => {
      this.entry = ctx.webui.addEntry({
        dev: import.meta.resolve('../client/index.ts'),
        prod: [
          import.meta.resolve('../dist/index.js'),
          import.meta.resolve('../dist/style.css'),
        ],
      }, () => (this.getPackages(), {
        config: this.getConfig(),
        packages: this.packages,
        services: this.getServices(),
      }))

      ctx.on('config', ctx.debounce(() => {
        this.entry?.patch({ config: this.getConfig() })
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

      ctx.webui.addListener('manager.package.list', async () => {
        return await this.getPackages()
      })

      ctx.webui.addListener('manager.package.runtime', async (name) => {
        let runtime = this.packages[name]?.runtime
        if (runtime) return runtime
        runtime = await this.parseExports(name)
        if (this.packages[name]) {
          this.packages[name].runtime = runtime
          this.flushPackage(name)
        }
        return runtime
      })

      ctx.webui.addListener('manager.service.list', () => {
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
    runtime.forks = Object.fromEntries(main.children
      .filter(fork => fork.entry)
      .map(fork => [fork.entry!.options.id, { status: fork.status }]))
  }

  async parseExports(name: string) {
    try {
      const exports = this.ctx.loader.unwrapExports(await this.ctx.loader.import(name))
      if (exports) this.plugins.set(exports, name)
      const result: RuntimeData = { id: null }
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

export namespace Manager {
  export interface Config {}

  export const Config: Schema<Config> = Schema.object({})
}
