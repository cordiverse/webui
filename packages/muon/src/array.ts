import { BaseNode, collapseBatch } from './base.ts'
import { isIndexKey, Mutation, trackable } from './common.ts'

const ARRAY_INVALIDATING_METHODS = new Set([
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'copyWithin',
  'fill',
])

export class ArrayNode extends BaseNode {
  baselineLength: number
  appendIndex: number
  truncateCount = 0
  changes = new Map<number, any>()

  constructor(public target: any[]) {
    super()
    this.baselineLength = target.length
    this.appendIndex = target.length
  }

  invalidate(): void {
    this.invalidated = true
    this.children.clear()
    this.childProxies.clear()
    this.changes.clear()
    this.truncateCount = 0
  }

  recordIndexSet(idx: number, value: any, prevLen: number): void {
    if (idx > prevLen) {
      // setting past current end with a gap creates holes
      this.invalidate()
      return
    }
    if (idx >= this.appendIndex) {
      // inside (or extending) the appended region; covered by trailing slice
      this.dropChild(idx)
      return
    }
    this.dropChild(idx)
    this.changes.set(idx, value)
  }

  recordLengthSet(newLength: number): void {
    const cur = this.target.length
    if (newLength === cur) return
    if (newLength > cur) {
      this.invalidate()
      return
    }
    if (newLength >= this.appendIndex) {
      // shrink within the appended region only; do nothing
      // drop trackers/changes for indices that no longer exist
      for (const k of [...this.children.keys()]) {
        if (typeof k === 'number' && k >= newLength) this.dropChild(k)
      }
      for (const k of [...this.changes.keys()]) {
        if (k >= newLength) this.changes.delete(k)
      }
      return
    }
    // shrinking into baseline: only valid if there were no in-bounds changes
    // and no appended region we'd be cutting through inconsistently
    if (this.target.length > this.appendIndex) {
      // some appended elements still exist but we're cutting deeper
      this.invalidate()
      return
    }
    if (this.changes.size || this.children.size) {
      this.invalidate()
      return
    }
    this.truncateCount += this.appendIndex - newLength
    this.appendIndex = newLength
    this.baselineLength = newLength
  }

  recordPop(): void {
    if (this.target.length >= this.appendIndex) return
    if (this.changes.size || this.children.size) {
      this.invalidate()
      return
    }
    this.truncateCount += 1
    this.appendIndex = this.target.length
    this.baselineLength = this.target.length
  }

  flush(): Mutation | null {
    if (this.invalidated) {
      return { path: [], kind: { type: 'replace', value: this.target } }
    }
    const items: Mutation[] = []
    if (this.truncateCount > 0) {
      items.push({ path: [], kind: { type: 'truncate', count: this.truncateCount } })
    }
    for (const [idx, value] of this.changes) {
      items.push({ path: [idx], kind: { type: 'replace', value } })
    }
    for (const [key, child] of this.children) {
      if (typeof key === 'number' && this.changes.has(key)) continue
      const sub = child.flush()
      if (sub) {
        items.push({ path: [key, ...sub.path], kind: sub.kind })
      }
    }
    if (this.target.length > this.appendIndex) {
      items.push({
        path: [],
        kind: { type: 'append', value: this.target.slice(this.appendIndex) },
      })
    }
    if (!items.length) return null
    if (items.length === 1) return items[0]
    return collapseBatch(items, this.target)
  }

  makeProxy() {
    const target = this.target
    return new Proxy(target, {
      get: (_t, key) => {
        if (typeof key === 'string' && ARRAY_INVALIDATING_METHODS.has(key)) {
          const method = (target as any)[key] as (...a: any[]) => any
          return (...args: any[]) => {
            this.invalidate()
            return method.apply(target, args)
          }
        }
        if (key === 'push') {
          return (...items: any[]) => target.push(...items)
        }
        if (key === 'pop') {
          return () => {
            if (target.length === 0) return undefined
            const value = target.pop()
            this.recordPop()
            return value
          }
        }
        if (typeof key === 'symbol') return (target as any)[key]
        if (isIndexKey(key)) {
          const idx = Number(key)
          const value = target[idx]
          if (
            trackable(value)
            && !this.changes.has(idx)
            && idx < this.appendIndex
          ) {
            return this.wrapChild(idx, value)
          }
          return value
        }
        return (target as any)[key]
      },
      set: (_t, key, value) => {
        if (key === 'length') {
          const n = Number(value)
          this.recordLengthSet(n)
          target.length = n
          return true
        }
        if (typeof key === 'symbol') {
          ;(target as any)[key] = value
          return true
        }
        if (isIndexKey(key)) {
          const idx = Number(key)
          const prevLen = target.length
          target[idx] = value
          this.recordIndexSet(idx, value, prevLen)
          return true
        }
        ;(target as any)[key] = value
        return true
      },
      deleteProperty: (_t, key) => {
        if (typeof key === 'string' && isIndexKey(key)) {
          this.invalidate()
        }
        return Reflect.deleteProperty(target, key)
      },
      has: (_t, key) => {
        return Reflect.has(target, key)
      },
      ownKeys: () => {
        return Reflect.ownKeys(target)
      },
      getOwnPropertyDescriptor: (_t, key) => {
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
  }
}
