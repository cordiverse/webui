import { Dict } from 'cosmokit'
import { PackageJson } from './types'

interface Ensure<T> {
  (value: any): T | undefined
}

export namespace Ensure {
  export const array: Ensure<string[]> = (value: any) => {
    if (!Array.isArray(value)) return
    return value.filter(x => typeof x === 'string')
  }

  export function dict<T>(value: any, callback?: (value: T) => T): Dict<T> | undefined {
    if (typeof value !== 'object' || value === null) return
    return Object.entries(value).reduce((dict, [key, value]: [string, any]) => {
      value = callback ? callback(value) : value
      if (value !== undefined) dict[key] = value
      return dict
    }, {})
  }

  export function object<T>(value: any, callback?: (value: T) => T): T | undefined {
    if (typeof value !== 'object' || value === null) return
    return callback ? callback(value) : value
  }

  // https://github.com/microsoft/TypeScript/issues/15713#issuecomment-499474386
  const primitive = <T, >(type: string): Ensure<T> => (value: any, fallback?: T) => {
    if (typeof value !== type) return fallback
    return value
  }

  export const boolean = primitive<boolean>('boolean')
  export const number = primitive<number>('number')
  export const string = primitive<string>('string')
}

export interface Ecosystem {
  name: string
  property: string
  inject: string[]
  pattern: string[]
  keywords: string[]
}

export namespace Ecosystem {
  export function check(ecosystem: Ecosystem, meta: PackageJson) {
    if (!meta.peerDependencies?.[ecosystem.name]) return
    for (const pattern of ecosystem.pattern) {
      const regexp = new RegExp('^' + pattern.replace('*', '.*') + '$')
      let prefix = '', name = meta.name
      if (!pattern.startsWith('@')) {
        prefix = /^@.+\//.exec(meta.name)?.[0] || ''
        name = name.slice(prefix.length)
      }
      if (!regexp.test(name)) continue
      const index = pattern.indexOf('*')
      return prefix + name.slice(index)
    }
    if (ecosystem.property in meta) return meta.name
  }
}

function concludeExport(base?: Manifest.Export | null, description?: string) {
  // undefined values are dropped during serialization
  if (typeof base !== 'object') return undefined!
  if (!base) return null

  const result: Manifest.Export = {
    browser: Ensure.boolean(base.browser),
    description: Ensure.dict(base.description) ?? Ensure.string(base.description ?? description),
    service: Ensure.object(base.service, (service) => ({
      required: Ensure.array(service.required),
      optional: Ensure.array(service.optional),
      implements: Ensure.array(service.implements),
    })),
    resources: Ensure.dict(base.resources),
  }

  if (typeof result.description === 'string') {
    result.description = result.description.slice(0, 1024)
  } else if (result.description) {
    for (const key in result.description) {
      result.description[key] = result.description[key].slice(0, 1024)
    }
  }

  return result
}

export interface Manifest extends Manifest.Export {
  hidden?: boolean
  preview?: boolean
  insecure?: boolean
  category?: string
  public?: string[]
  exports?: Dict<Manifest.Export | null>
  ecosystem?: Partial<Ecosystem>
}

export namespace Manifest {
  export interface Export {
    browser?: boolean
    description?: string | Dict<string>
    service?: Manifest.Service
    resources?: Dict
  }

  export interface Service {
    required?: string[]
    optional?: string[]
    implements?: string[]
  }

  export const conclude = (meta: PackageJson, prop = 'cordis'): Manifest => ({
    ...concludeExport(meta[prop], meta.description),
    hidden: Ensure.boolean(meta[prop]?.hidden),
    preview: Ensure.boolean(meta[prop]?.preview),
    insecure: Ensure.boolean(meta[prop]?.insecure),
    category: Ensure.string(meta[prop]?.category),
    public: Ensure.array(meta[prop]?.public),
    ecosystem: Ensure.object(meta[prop]?.ecosystem, (ecosystem) => ({
      property: Ensure.string(ecosystem.property),
      inject: Ensure.array(ecosystem.inject),
      pattern: Ensure.array(ecosystem.pattern),
      keywords: Ensure.array(ecosystem.keywords),
    })),
    exports: Ensure.dict(meta[prop]?.exports, concludeExport),
  })
}
