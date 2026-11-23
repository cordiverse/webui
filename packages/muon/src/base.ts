import { Mutation, PathSegment, trackable } from './common.ts'

let nodeFactory: ((target: any) => BaseNode) | null = null

export function registerNodeFactory(factory: (target: any) => BaseNode): void {
  nodeFactory = factory
}

export abstract class BaseNode {
  invalidated = false
  children = new Map<PathSegment, BaseNode>()
  childProxies = new Map<PathSegment, object>()

  abstract target: object
  abstract flush(): Mutation | null
  abstract makeProxy(): any

  wrapChild(key: PathSegment, value: any): any {
    if (!trackable(value)) return value
    const cached = this.childProxies.get(key)
    if (cached) {
      const cachedNode = this.children.get(key)
      if (cachedNode && cachedNode.target === value) return cached
    }
    if (!nodeFactory) throw new Error('muon: node factory not registered')
    const child = nodeFactory(value)
    this.children.set(key, child)
    const proxy = child.makeProxy()
    this.childProxies.set(key, proxy)
    return proxy
  }

  dropChild(key: PathSegment): void {
    this.children.delete(key)
    this.childProxies.delete(key)
  }
}

export function collapseBatch(items: Mutation[], target: object): Mutation {
  // If every item is a root-level Replace covering all keys of target, collapse to
  // a single Replace of the whole composite.
  if (Array.isArray(target)) {
    if (
      items.length === target.length
      && items.every(
        (m, _i) =>
          m.path.length === 1
          && typeof m.path[0] === 'number'
          && m.kind.type === 'replace',
      )
    ) {
      const seen = new Set<number>()
      for (const m of items) seen.add(m.path[0] as number)
      if (seen.size === target.length) {
        return { path: [], kind: { type: 'replace', value: target } }
      }
    }
  } else {
    const keys = Object.keys(target)
    if (
      items.length === keys.length
      && items.every(
        (m) => m.path.length === 1 && typeof m.path[0] === 'string' && m.kind.type === 'replace',
      )
    ) {
      const seen = new Set<string>()
      for (const m of items) seen.add(m.path[0] as string)
      if (seen.size === keys.length && keys.every(k => seen.has(k))) {
        return { path: [], kind: { type: 'replace', value: target } }
      }
    }
  }
  return { path: [], kind: { type: 'batch', items } }
}
