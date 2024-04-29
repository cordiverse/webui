import { Dict } from 'cosmokit'
import { Manifest, PackageJson } from './types'

interface Ensure<T> {
  (value: any): T | undefined
}

export namespace Ensure {
  export const array: Ensure<string[]> = (value: any) => {
    if (!Array.isArray(value)) return
    return value.filter(x => typeof x === 'string')
  }

  export const dict = <T>(value: any, callback?: (value: T) => T): Dict<T> | undefined => {
    if (typeof value !== 'object' || value === null) return
    return Object.entries(value).reduce((dict, [key, value]: [string, any]) => {
      value = callback ? callback(value) : value
      if (value !== undefined) dict[key] = value
      return dict
    }, {})
  }

  export const object = <T>(value: any, callback?: (value: T) => T): T | undefined => {
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

function concludeBase(base?: Manifest.Base | null, description?: string) {
  if (typeof base !== 'object') return
  if (!base) return null

  const result: Manifest.Base = {
    browser: Ensure.boolean(base.browser),
    description: Ensure.dict(base.description) ?? Ensure.string(description),
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

export function conclude(meta: PackageJson) {
  const result: Manifest = {
    ...concludeBase(meta.cordis, meta.description),
    hidden: Ensure.boolean(meta.cordis?.hidden),
    preview: Ensure.boolean(meta.cordis?.preview),
    insecure: Ensure.boolean(meta.cordis?.insecure),
    category: Ensure.string(meta.cordis?.category),
    public: Ensure.array(meta.cordis?.public),
    ecosystem: Ensure.object(meta.cordis?.ecosystem, (ecosystem) => ({
      inject: Ensure.array(ecosystem.inject),
      pattern: Ensure.array(ecosystem.pattern),
      keywords: Ensure.array(ecosystem.keywords),
    })),
    exports: Ensure.dict(meta.cordis?.exports, concludeBase),
  }

  return result
}
