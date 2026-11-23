export type PathSegment = string | number

export namespace Mutation {
  export interface Replace {
    type: 'replace'
    value: any
  }

  export interface Append {
    type: 'append'
    value: any
  }

  export interface Truncate {
    type: 'truncate'
    count: number
  }

  export interface Delete {
    type: 'delete'
  }

  export interface Batch {
    type: 'batch'
    items: Mutation[]
  }
}

export type MutationKind =
  | Mutation.Replace
  | Mutation.Append
  | Mutation.Truncate
  | Mutation.Delete
  | Mutation.Batch

export interface Mutation {
  path: PathSegment[]
  kind: MutationKind
}

export function isPlainObject(value: any): value is Record<string, any> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function trackable(value: any): boolean {
  return Array.isArray(value) || isPlainObject(value)
}

export function isIndexKey(key: string | symbol): key is string {
  if (typeof key !== 'string') return false
  if (key === '') return false
  const n = Number(key)
  return Number.isInteger(n) && n >= 0 && String(n) === key
}
