import { Awaitable, Dict, Time } from 'cosmokit'
import { Registry, RemotePackage, SearchObject, SearchResult } from './types'
import { Ecosystem, Manifest } from './manifest'
import { compare } from 'semver'
import pMap from 'p-map'

export interface RemoteScanner extends SearchResult {}

export namespace RemoteScanner {
  export interface Options {
    registry: string
    request?<T>(url: URL, config?: RequestConfig): Promise<T>
    onFailure?(name: string, reason: any): void
    onSuccess?(object: SearchObject): Awaitable<void>
  }

  export interface CollectOptions {
    step?: number
    margin?: number
    timeout?: number
  }

  export interface AnalyzeConfig {
    concurrency?: number
    before?(object: SearchObject): void
    onRegistry?(registry: Registry, versions: RemotePackage[]): Awaitable<void>
    onSuccess?(object: SearchObject, versions: RemotePackage[]): Awaitable<void>
    onFailure?(name: string, reason: any): Awaitable<void>
    onSkipped?(name: string): Awaitable<void>
    after?(object: SearchObject): void
  }
}

export interface RequestConfig {
  timeout?: number
}

// function clear(object: Dict) {
//   for (const key of Object.keys(object)) {
//     delete object[key]
//   }
// }

export class RemoteScanner {
  ecosystems: Dict<Ecosystem> = Object.create(null)
  cache: Dict<Dict<SearchObject>> = Object.create(null)

  constructor(public options: RemoteScanner.Options) {
    this.ecosystems.cordis = {
      name: 'cordis',
      property: 'cordis',
      inject: [],
      pattern: ['cordis-plugin-*', '@cordisjs/plugin-*'],
      keywords: ['cordis', 'plugin'],
    }
  }

  async request<T>(path: string, config?: RequestConfig) {
    const url = new URL(path, this.options.registry)
    if (this.options.request) {
      return this.options.request<T>(url, config)
    }
    const response = await fetch(url, {
      signal: AbortSignal.timeout(config?.timeout ?? 30000),
    })
    return await response.json() as T
  }

  private async search(eco: string, offset: number, config: RemoteScanner.CollectOptions = {}) {
    const { step = 250, timeout = Time.second * 30 } = config
    const { keywords } = this.ecosystems[eco]
    const result = await this.request<SearchResult>(`/-/v1/search?text=${keywords.join('+')}&size=${step}&from=${offset}`, { timeout })
    this.version = result.version
    for (const object of result.objects) {
      this.cache[eco][object.package.name] = object
    }
    return result.total
  }

  public async collect(eco: string, config: RemoteScanner.CollectOptions = {}) {
    const { step = 250, margin = 25 } = config
    this.cache[eco] = Object.create(null)
    this.time = new Date().toUTCString()
    const total = await this.search(eco, 0, config)
    for (let offset = Object.values(this.cache).length; offset < total; offset += step - margin) {
      await this.search(eco, offset - margin, config)
    }
    this.objects = Object.values(this.cache[eco])
    this.total = this.objects.length
  }

  public async process(eco: string, object: SearchObject, options: RemoteScanner.AnalyzeConfig) {
    const registry = await this.request<Registry>(`/${object.package.name}`)
    const compatible = Object.values(registry.versions).sort((a, b) => compare(b.version, a.version))

    await options?.onRegistry?.(registry, compatible)
    const versions = compatible.filter(item => !item.deprecated)
    if (!versions.length) return

    const latest = registry.versions[versions[0].version]
    const shortname = Ecosystem.check(this.ecosystems[eco], latest)
    if (!shortname) return

    const manifest = Manifest.conclude(latest, this.ecosystems[eco].property)
    const times = compatible.map(item => registry.time[item.version]).sort()

    object.ecosystem = eco
    object.shortname = shortname
    object.manifest = manifest
    object.insecure = manifest.insecure
    object.category = manifest.category
    object.createdAt = times[0]
    object.updatedAt = times[times.length - 1]
    object.package.contributors ??= latest.author ? [latest.author] : []
    object.package.keywords = latest.keywords ?? []
    return versions
  }

  public async analyze(eco: string, config: RemoteScanner.AnalyzeConfig) {
    const { concurrency = 5, before, onSuccess, onFailure, onSkipped, after } = config

    const result = await pMap(this.objects, async (object) => {
      if (object.ignored) return
      before?.(object)
      try {
        const versions = await this.process(eco, object, config)
        if (versions) {
          await onSuccess?.(object, versions)
          return versions
        } else {
          object.ignored = true
          await onSkipped?.(object.package.name)
        }
      } catch (error) {
        object.ignored = true
        await onFailure?.(object.package.name, error)
      } finally {
        after?.(object)
      }
    }, { concurrency })

    return result.filter(<T>(x: T): x is T & {} => !!x)
  }
}
