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
  methods?: string[]
}

export interface EntryInit {
  entries: Record<string, EntryData>
  version: string
}

export interface EntryDelta extends Delta {
  id: string
}

export interface RpcRequest {
  sn: number
  entryId: string
  method: string
  args: any[]
}

export type RpcResponse =
  | { sn: number; ok: true; value: any }
  | { sn: number; ok: false; message: string }

export interface Events {
  'entry:init'(data: EntryInit): void
  'entry:delta'(data: EntryDelta): void
  'rpc:request'(data: RpcRequest): void
  'rpc:response'(data: RpcResponse): void
}
