import { BaseNode, collapseBatch } from './base.ts'
import { Mutation, trackable } from './common.ts'

interface ChangeSet {
  kind: 'set'
  value: any
}

interface ChangeDelete {
  kind: 'delete'
}

type Change = ChangeSet | ChangeDelete

export class ObjectNode extends BaseNode {
  changes = new Map<string, Change>()
  originals = new Map<string, any>()

  constructor(public target: Record<string, any>) {
    super()
  }

  recordSet(key: string, oldValue: any, newValue: any): void {
    if (!this.originals.has(key)) {
      this.originals.set(key, oldValue)
    }
    this.dropChild(key)
    this.changes.set(key, { kind: 'set', value: newValue })
  }

  recordDelete(key: string, oldValue: any): void {
    if (!this.originals.has(key)) {
      this.originals.set(key, oldValue)
    }
    this.dropChild(key)
    this.changes.set(key, { kind: 'delete' })
  }

  invalidate(): void {
    this.invalidated = true
    this.children.clear()
    this.childProxies.clear()
    this.changes.clear()
  }

  flush(): Mutation | null {
    if (this.invalidated) {
      return { path: [], kind: { type: 'replace', value: this.target } }
    }
    const items: Mutation[] = []
    for (const [key, change] of this.changes) {
      if (change.kind === 'delete') {
        items.push({ path: [key], kind: { type: 'delete' } })
      } else {
        const original = this.originals.get(key)
        const next = this.target[key]
        if (
          typeof original === 'string'
          && typeof next === 'string'
          && next.length > original.length
          && next.startsWith(original)
        ) {
          items.push({
            path: [key],
            kind: { type: 'append', value: next.slice(original.length) },
          })
        } else {
          items.push({ path: [key], kind: { type: 'replace', value: next } })
        }
      }
    }
    for (const [key, child] of this.children) {
      if (this.changes.has(key as string)) continue
      const sub = child.flush()
      if (sub) {
        items.push({ path: [key, ...sub.path], kind: sub.kind })
      }
    }
    if (!items.length) return null
    if (items.length === 1) return items[0]
    return collapseBatch(items, this.target)
  }

  makeProxy() {
    const target = this.target
    return new Proxy(target, {
      get: (_t, key) => {
        if (typeof key === 'symbol') return (target as any)[key]
        const value = (target as any)[key]
        if (trackable(value) && !this.changes.has(key)) {
          return this.wrapChild(key, value)
        }
        return value
      },
      set: (_t, key, value) => {
        if (typeof key === 'symbol') {
          ;(target as any)[key] = value
          return true
        }
        const old = (target as any)[key]
        ;(target as any)[key] = value
        this.recordSet(key, old, value)
        return true
      },
      deleteProperty: (_t, key) => {
        if (typeof key === 'symbol') return Reflect.deleteProperty(target, key)
        const old = (target as any)[key]
        const ok = Reflect.deleteProperty(target, key)
        if (ok) this.recordDelete(key, old)
        return ok
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
