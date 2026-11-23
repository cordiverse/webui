import { isPlainObject, Mutation, MutationKind } from './common.ts'

export function apply<T>(target: T, mutation: Mutation): T {
  return applyAt(target, mutation, 0) as T
}

function applyAt(target: any, m: Mutation, depth: number): any {
  if (depth === m.path.length) {
    return applyKind(target, m.kind)
  }
  if (depth === m.path.length - 1 && m.kind.type === 'delete') {
    const seg = m.path[depth]
    if (isPlainObject(target) && typeof seg === 'string') {
      delete (target as Record<string, any>)[seg]
      return target
    }
    throw new TypeError('muon: delete requires an object parent at the final path segment')
  }
  const seg = m.path[depth]
  if (Array.isArray(target) && typeof seg === 'number') {
    target[seg] = applyAt(target[seg], m, depth + 1)
    return target
  }
  if (isPlainObject(target) && typeof seg === 'string') {
    target[seg] = applyAt(target[seg], m, depth + 1)
    return target
  }
  throw new TypeError(`muon: cannot navigate path segment ${String(seg)} at depth ${depth}`)
}

function applyKind(value: any, kind: MutationKind): any {
  switch (kind.type) {
    case 'replace':
      return kind.value
    case 'append':
      if (typeof value === 'string' && typeof kind.value === 'string') {
        return value + kind.value
      }
      if (Array.isArray(value) && Array.isArray(kind.value)) {
        value.push(...kind.value)
        return value
      }
      throw new TypeError('muon: append requires matching string or array value')
    case 'truncate':
      if (typeof value === 'string') {
        const n = Math.max(0, value.length - kind.count)
        return value.slice(0, n)
      }
      if (Array.isArray(value)) {
        value.length = Math.max(0, value.length - kind.count)
        return value
      }
      throw new TypeError('muon: truncate requires a string or array target')
    case 'delete':
      throw new TypeError('muon: cannot apply delete at root')
    case 'batch': {
      let cur = value
      for (const item of kind.items) {
        cur = applyAt(cur, item, 0)
      }
      return cur
    }
  }
}
