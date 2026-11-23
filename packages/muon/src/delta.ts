import { Mutation, MutationKind, PathSegment } from './common.ts'

export type DeltaOp = 'SET' | 'APPEND' | 'TRUNCATE' | 'DELETE' | 'BATCH'

export interface Delta {
  p?: PathSegment[]
  o?: DeltaOp
  v?: any
}

function pathsEqual(a: PathSegment[], b: PathSegment[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export class DeltaState {
  private p: PathSegment[] = []
  private o: DeltaOp = 'SET'

  snapshot(): { p: PathSegment[]; o: DeltaOp } {
    return { p: [...this.p], o: this.o }
  }

  restore(state: { p: PathSegment[]; o: DeltaOp }): void {
    this.p = [...state.p]
    this.o = state.o
  }

  load(delta: Delta): Mutation {
    if (delta.o !== undefined) this.o = delta.o
    if (delta.p !== undefined) this.p = [...delta.p]
    const kind = this.loadKind(delta.v)
    return { path: [...this.p], kind }
  }

  private loadKind(v: any): MutationKind {
    switch (this.o) {
      case 'SET':
        return { type: 'replace', value: v }
      case 'APPEND':
        return { type: 'append', value: v }
      case 'TRUNCATE':
        if (typeof v !== 'number') throw new TypeError('muon: TRUNCATE delta requires numeric value')
        return { type: 'truncate', count: v }
      case 'DELETE':
        return { type: 'delete' }
      case 'BATCH': {
        if (!Array.isArray(v)) throw new TypeError('muon: BATCH delta requires array value')
        const inner = new DeltaState()
        const items = v.map((d: Delta) => inner.load(d))
        return { type: 'batch', items }
      }
    }
  }

  dump(mutation: Mutation): Delta {
    const newP = mutation.path
    let newO: DeltaOp
    let v: any
    let hasV = true
    switch (mutation.kind.type) {
      case 'replace':
        newO = 'SET'
        v = mutation.kind.value
        break
      case 'append':
        newO = 'APPEND'
        v = mutation.kind.value
        break
      case 'truncate':
        newO = 'TRUNCATE'
        v = mutation.kind.count
        break
      case 'delete':
        newO = 'DELETE'
        v = undefined
        hasV = false
        break
      case 'batch': {
        newO = 'BATCH'
        const inner = new DeltaState()
        v = mutation.kind.items.map((m) => inner.dump(m))
        break
      }
    }
    const delta: Delta = {}
    if (!pathsEqual(this.p, newP)) {
      this.p = [...newP]
      delta.p = [...newP]
    }
    if (this.o !== newO) {
      this.o = newO
      delta.o = newO
    }
    if (hasV) delta.v = v
    return delta
  }
}
