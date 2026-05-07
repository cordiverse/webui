import { Context, EffectMeta, Inject, Plugin, FiberState, Service } from 'cordis'
import { readFile } from 'node:fs/promises'
import { Dict, pick } from 'cosmokit'
import { Entry, EntryOptions, EntryTree } from '@cordisjs/plugin-loader'
import { Entry as ClientEntry } from '@cordisjs/plugin-webui'
import { PackageJson, SearchObject } from './types.ts'
import type {} from '@cordisjs/plugin-logger'
import type {} from '@cordisjs/plugin-timer'
import type {} from '@cordisjs/plugin-hmr'
import z from 'schemastery'

declare module 'cordis' {
  interface Context {
    _manager: Manager
  }
}

declare module '@cordisjs/plugin-loader' {
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
    'manager.config.eval'(options: { id: string; expr: string; schema: z }): Promise<EvalResult>
    'manager.dependency.list'(): Promise<Dependency[]>
    'manager.package.list'(): Promise<LocalObject[]>
    'manager.package.runtime'(options: { name: string }): Promise<RuntimeData | null>
    'manager.package.readme'(options: { name: string; locale: string }): Promise<string | null>
    'manager.service.list'(): Promise<Dict<ServiceData>>
  }
}

export interface LocalObject extends Pick<SearchObject, 'shortname' | 'workspace' | 'manifest'> {
  package: Pick<PackageJson, 'name' | 'version'>
  readme?: Dict<string | null>
  _readmeFiles?: Dict<string | Promise<string>>
  runtime?: RuntimeData | null
}

export interface Dependency {
  name: string
  request: string
  path?: string
  workspace?: boolean
  package?: PackageJson
}

export interface EvalResult {
  error?: 'syntax' | 'evaluation' | 'validation' | 'serialization'
  value?: any
}

export interface EntryData extends EntryOptions, Required<EntryLocation> {
  isGroup?: boolean
  state?: FiberState
  effects?: EffectMeta[]
}

export interface Provider {
  location?: string
  schema?: z
}

export interface ServiceData {
  root?: Provider
  local: Dict<Provider>
  global: Dict<Provider>
}

export interface Data {
  entries: EntryData[]
  packages: Dict<LocalObject>
  services: Dict<ServiceData>
  prefix: string
}

export interface RuntimeData {
  schema?: z
  usage?: string
  inject?: Dict<Inject.Meta | undefined>
}

export interface EntryLocation {
  parent?: string | null
  position?: number
}

@Inject('loader')
@Inject('timer')
@Inject('logger', false, { name: 'manager' })
export abstract class Manager extends Service {
  public entry?: ClientEntry<Data>

  protected packages: Dict<LocalObject> = Object.create(null)

  private plugins = new WeakMap<Plugin, string>()
  private pending = new Set<string>()
  private flushTimer?: NodeJS.Timeout
  private rootTree: EntryTree
  private rootPrefix = ''

  constructor(public ctx: Context) {
    super(ctx, '_manager')
    let entry: Entry | undefined = this.ctx.fiber.entry
    while (entry?.parent.tree.ctx.fiber.entry) {
      entry = entry.parent.tree.ctx.fiber.entry
    }
    this.rootTree = entry?.subtree ?? this.ctx.loader
    const rootEntry = this.rootTree.ctx.fiber.entry
    this.rootPrefix = rootEntry ? rootEntry.id + EntryTree.sep : ''
  }

  private stripId(id?: string): string | null {
    if (!id) return null
    if (!this.rootPrefix) return id
    if (id + EntryTree.sep === this.rootPrefix) return null
    if (id.startsWith(this.rootPrefix)) return id.slice(this.rootPrefix.length)
    return id
  }

  getEntries() {
    return [...this.rootTree.entries()].map<EntryData>((entry) => ({
      ...entry.options,
      id: this.stripId(entry.id)!,
      config: entry.subgroup?.data === entry.options.config ? undefined : entry.options.config,
      parent: this.stripId(entry.parent.ctx.fiber.entry?.id),
      position: entry.parent.data.indexOf(entry.options),
      isGroup: !!entry.subgroup,
      state: entry.fiber?.state,
      effects: entry.fiber?.getEffects?.(),
    }))
  }

  private getServiceInfo(ctx: Context, name: string): Provider | undefined {
    const key = ctx[Context.isolate][name]
    const impl = ctx.reflect.store[key]
    if (!impl?.fiber) return
    const location = this.stripId(this.ctx.loader.locate(impl.fiber)) ?? undefined
    const schema = impl.value?.Config
    return { location, schema }
  }

  getServices() {
    const result = Object.create(null) as Dict<ServiceData>
    for (const [name, { type }] of Object.entries(this.ctx.reflect.props)) {
      if (type !== 'service') continue
      result[name] = {
        root: this.getServiceInfo(this.ctx.root, name),
        local: {},
        global: {},
      }
    }
    for (const entry of this.rootTree.entries()) {
      if (!entry.options.isolate) continue
      for (const [name, value] of Object.entries(entry.options.isolate)) {
        if (!result[name]) continue
        const id = this.stripId(entry.id)!
        if (value === true) {
          result[name].local[id] = this.getServiceInfo(entry.ctx, name)!
        } else {
          result[name].global[value] = this.getServiceInfo(entry.ctx, name)!
        }
      }
    }
    return result
  }

  @Inject('webui')
  injectWebUI() {
    this.entry = this.ctx.webui.addEntry({
      base: import.meta.url,
      dev: '../client/index.ts',
      prod: '../dist/manifest.json',
    }, {
      entries: this.getEntries(),
      packages: this.packages,
      services: this.getServices(),
      prefix: this.rootPrefix,
    })

    // kick off package scan; results will arrive via flushPackage
    this.getPackages()

    const updateEntries = this.ctx.debounce(() => {
      this.entry?.mutate((d) => {
        d.entries = this.getEntries()
      })
    }, 0)

    this.ctx.on('loader/config-update', updateEntries)

    this.ctx.on('internal/service', this.ctx.debounce(() => {
      this.entry?.mutate((d) => {
        d.services = this.getServices()
      })
    }, 0))

    this.ctx.on('internal/plugin', (fiber) => {
      const name = this.plugins.get(fiber.runtime!.callback)
      if (!name || !this.packages[name].runtime) return
      this.flushPackage(name)
    })

    this.ctx.on('internal/status', updateEntries)

    this.ctx.on('hmr/reload', (reloads) => {
      reloads.forEach((_, plugin) => this.updatePlugin(plugin))
    })

    this.ctx.webui.addListener('manager.config.list', () => {
      return this.getEntries()
    })

    this.ctx.webui.addListener('manager.config.create', (options) => {
      const { parent, position, ...rest } = options
      return this.rootTree.create(rest, parent, position)
    })

    this.ctx.webui.addListener('manager.config.update', (options) => {
      const { id, parent, position, ...rest } = options
      return this.rootTree.update(id, rest, parent, position)
    })

    this.ctx.webui.addListener('manager.config.remove', (options) => {
      return this.rootTree.remove(options.id)
    })

    this.ctx.webui.addListener('manager.config.eval', async ({ id, expr, schema }) => {
      const entry = this.rootTree.resolve(id)
      schema = z(schema)
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

  /** Drop cached scan results so subsequent reads re-walk node_modules. */
  protected reset() {}

  /** Force re-scan and re-broadcast the full packages dict. */
  async refresh() {
    this.reset()
    this.packages = Object.create(null)
    await this.getPackages()
    this.entry?.mutate((d) => {
      d.packages = this.packages
    })
  }

  flushPackage(name: string) {
    this.pending.add(name)
    this.flushTimer ??= setTimeout(() => {
      const updates = pick(this.packages, this.pending)
      this.pending.clear()
      this.flushTimer = undefined
      this.entry?.mutate((d) => {
        Object.assign(d.packages, updates)
      })
    }, 100)
  }

  async updatePlugin(plugin: Plugin) {
    const name = this.plugins.get(plugin)
    if (!name || !this.packages[name].runtime) return
    this.packages[name].runtime = await this.parseExports(name)
    this.flushPackage(name)
  }

  async parseExports(name: string) {
    try {
      const exports = await this.ctx.loader.import(name)
      const plugin = this.ctx.loader.unwrapExports(exports)
      if (plugin) this.plugins.set(plugin, name)
      const result: RuntimeData = { inject: {} }
      result.schema = plugin?.Config || plugin?.schema
      result.usage = plugin?.usage
      result.inject = Inject.resolve(plugin?.using || plugin?.inject)

      // make sure that result can be serialized into json
      JSON.stringify(result)
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
}
