import { clone } from 'cosmokit'
import { apply } from './apply.ts'
import { Mutation, PathSegment } from './common.ts'

/**
 * Aggregator for multiple mutations. Unlike `observe`, which produces one
 * `Mutation` per call and whose `kind.value` holds live refs, `BatchTree`
 * **owns** every value it has ingested:
 *
 *   load(m1)              // value of m1 is deep-cloned into the tree
 *   // ...arbitrary external mutation of live data...
 *   load(m2)              // value of m2 is deep-cloned into the tree
 *   batch.dump()          // merged, single mutation
 *
 * This is required for correctness: a second `load` on a path that already
 * has an accumulated Replace would otherwise see the previously-stored ref
 * pointing into data that the caller has since mutated.
 */

type BatchKind =
  | { type: 'none' }
  | { type: 'replace'; value: any }
  | { type: 'delete' }
  | { type: 'truncate-append'; truncateCount: number; appendValue: any | null; appendLen: number }

type ChildrenKind = 'string' | 'number' | null

export class MutationError extends Error {
  constructor(public code: 'index' | 'operation', public path: PathSegment[]) {
    super(`muon: ${code} error at path ${JSON.stringify(path)}`)
    this.name = 'MutationError'
  }
}

function valueLen(value: any): number | null {
  if (typeof value === 'string') return [...value].length
  if (Array.isArray(value)) return value.length
  return null
}

export class BatchTree {
  private kind: BatchKind = { type: 'none' }
  private children: Map<PathSegment, BatchTree> | null = null
  private childrenKind: ChildrenKind = null

  load(mutation: Mutation): void {
    this.loadWithStack(clone(mutation), [])
  }

  private loadWithStack(mutation: Mutation, pathStack: PathSegment[]): void {
    // If this node is already a full Replace, subsequent sub-paths just
    // apply into the owned value.
    if (this.kind.type === 'replace') {
      this.kind.value = apply(this.kind.value, mutation)
      return
    }

    // Walk into children while we still have path segments. We iterate
    // from the end because `Mutation.path` is root→leaf and we process
    // segments one at a time from the root down.
    let node: BatchTree = this
    const segs = mutation.path
    for (let i = 0; i < segs.length; i++) {
      const segment = segs[i]
      const isLast = i === segs.length - 1
      pathStack.push(segment)

      const segKind: 'string' | 'number' = typeof segment === 'number' ? 'number' : 'string'
      if (node.children === null) {
        node.children = new Map()
        node.childrenKind = segKind
      } else if (node.childrenKind !== segKind) {
        throw new MutationError('index', [...pathStack])
      }

      let child = node.children.get(segment)
      if (!child) {
        child = new BatchTree()
        node.children.set(segment, child)
      }
      node = child

      // Descending into a child that holds a Replace: apply the remaining
      // path + kind onto the owned value.
      if (node.kind.type === 'replace') {
        const rest: Mutation = {
          path: segs.slice(i + 1),
          kind: mutation.kind,
        }
        node.kind.value = apply(node.kind.value, rest)
        return
      }

      if (isLast) break
    }

    // Arrived at the target node; integrate by kind.
    const kind = mutation.kind
    switch (kind.type) {
      case 'replace':
        node.kind = { type: 'replace', value: kind.value }
        node.children = null
        node.childrenKind = null
        return

      case 'delete':
        node.kind = { type: 'delete' }
        node.children = null
        node.childrenKind = null
        return

      case 'batch': {
        const base = pathStack.length
        for (const inner of kind.items) {
          // inner.path is already cloned (cloneMutation above produced a
          // deep copy of the whole batch), so we can reuse.
          // Load relative to the current node, matching Rust's
          // `batch.load_with_stack(mutation, path_stack)`.
          node.loadWithStack({ path: inner.path, kind: inner.kind }, pathStack)
          pathStack.length = base
        }
        return
      }

      case 'append':
        appendAt(node, kind.value, pathStack)
        return

      case 'truncate':
        truncateAt(node, kind.count, pathStack)
    }
  }

  /**
   * Emit the merged mutation (or `null` if no mutations were loaded).
   *
   * Returned values are refs into the tree's owned state; consume before
   * further `load` calls. Calling `dump` empties the tree.
   */
  dump(): Mutation | null {
    const out = this.dumpNode()
    this.reset()
    return out
  }

  private reset(): void {
    this.kind = { type: 'none' }
    this.children = null
    this.childrenKind = null
  }

  private dumpNode(): Mutation | null {
    const items: Mutation[] = []

    // truncate comes before children/append (mirrors Rust flush order)
    if (this.kind.type === 'truncate-append') {
      if (this.kind.truncateCount > 0) {
        items.push({ path: [], kind: { type: 'truncate', count: this.kind.truncateCount } })
      }
    }

    if (this.children) {
      // Iterate in insertion order. For number keys, the Rust version used
      // BTreeMap (sorted) — we mimic with a sort.
      const entries = [...this.children.entries()]
      if (this.childrenKind === 'number') {
        entries.sort((a, b) => (a[0] as number) - (b[0] as number))
      } else {
        entries.sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      }
      for (const [segment, child] of entries) {
        const sub = child.dumpNode()
        if (!sub) continue
        items.push({ path: [segment, ...sub.path], kind: sub.kind })
      }
    }

    switch (this.kind.type) {
      case 'none':
        break
      case 'replace':
        items.push({ path: [], kind: { type: 'replace', value: this.kind.value } })
        break
      case 'delete':
        items.push({ path: [], kind: { type: 'delete' } })
        break
      case 'truncate-append':
        if (this.kind.appendLen > 0 && this.kind.appendValue !== null) {
          items.push({ path: [], kind: { type: 'append', value: this.kind.appendValue } })
        }
        break
    }

    if (items.length === 0) return null
    if (items.length === 1) return items[0]
    return { path: [], kind: { type: 'batch', items } }
  }
}

function appendAt(node: BatchTree, value: any, pathStack: PathSegment[]): void {
  const priv = node as any as {
    kind: BatchKind
  }
  switch (priv.kind.type) {
    case 'replace':
      // unreachable (handled earlier in loadWithStack)
      throw new MutationError('operation', [...pathStack])
    case 'delete':
      throw new MutationError('operation', [...pathStack])
    case 'none': {
      const len = valueLen(value)
      if (len === null) throw new MutationError('operation', [...pathStack])
      if (len === 0) return
      priv.kind = { type: 'truncate-append', truncateCount: 0, appendLen: len, appendValue: value }
      return
    }
    case 'truncate-append': {
      if (priv.kind.appendValue === null) {
        const len = valueLen(value)
        if (len === null) throw new MutationError('operation', [...pathStack])
        priv.kind.appendValue = value
        priv.kind.appendLen = len
        return
      }
      // merge into existing owned appendValue
      if (typeof priv.kind.appendValue === 'string' && typeof value === 'string') {
        priv.kind.appendValue = priv.kind.appendValue + value
        priv.kind.appendLen += [...value].length
        return
      }
      if (Array.isArray(priv.kind.appendValue) && Array.isArray(value)) {
        const added = value.length
        priv.kind.appendValue.push(...value)
        priv.kind.appendLen += added
        return
      }
      throw new MutationError('operation', [...pathStack])
    }
  }
}

function truncateAt(node: BatchTree, count: number, pathStack: PathSegment[]): void {
  const priv = node as any as {
    kind: BatchKind
    children: Map<PathSegment, BatchTree> | null
    childrenKind: ChildrenKind
  }
  switch (priv.kind.type) {
    case 'replace':
      // unreachable (handled earlier)
      throw new MutationError('operation', [...pathStack])
    case 'delete':
      throw new MutationError('operation', [...pathStack])
    case 'none': {
      if (count === 0) return
      priv.kind = { type: 'truncate-append', truncateCount: count, appendLen: 0, appendValue: null }
      return
    }
    case 'truncate-append': {
      if (priv.kind.appendValue !== null) {
        // truncate eats into the appended tail first
        const lenBefore = priv.kind.appendLen
        let remaining = count
        if (remaining >= lenBefore) {
          remaining -= lenBefore
          priv.kind.appendValue = null
          priv.kind.appendLen = 0
        } else {
          if (typeof priv.kind.appendValue === 'string') {
            // char-count truncation
            const chars = [...priv.kind.appendValue]
            chars.length = lenBefore - remaining
            priv.kind.appendValue = chars.join('')
          } else if (Array.isArray(priv.kind.appendValue)) {
            priv.kind.appendValue.length = lenBefore - remaining
          } else {
            throw new MutationError('operation', [...pathStack])
          }
          priv.kind.appendLen = lenBefore - remaining
          remaining = 0
        }
        priv.kind.truncateCount += remaining
      } else {
        priv.kind.truncateCount += count
      }

      if (priv.kind.truncateCount === 0 && priv.kind.appendLen === 0) {
        priv.kind = { type: 'none' }
      }
    }
  }
}
