import type { Delta, DeltaOp, PathSegment } from '@cordisjs/muon'

export interface DeltaCursor {
  p: PathSegment[]
  o: DeltaOp
}

export interface EntryData {
  files: string[]
  entryId?: string
  data?: any
  cursor?: DeltaCursor
}

export interface EntryInit {
  entries: Dict<EntryData>
  serverId: string
  clientId?: string
}

export interface EntryDelta extends Delta {
  id: string
}

export interface Events {
  'entry:init'(data: EntryInit): void
  'entry:delta'(data: EntryDelta): void
}
