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

/** A call of a method of an entry, by `entryId`, or of a service, by `service`. */
export interface RpcRequest {
  /** unique within a connection, and echoed by the response */
  sn: number
  entryId?: string
  service?: string
  method: string
  args: any[]
}

/** The result of a call. A call has at most one result, and none if the connection closes first. */
export type RpcResponse =
  | { sn: number; ok: true; value: any }
  | { sn: number; ok: false; message: string; code?: string }

/** The complete set of the names of the services that the host provides. */
export interface HostSync {
  services: string[]
}

export interface Events {
  'entry:init'(data: EntryInit): void
  'entry:delta'(data: EntryDelta): void
  'rpc:request'(data: RpcRequest): void
  'rpc:response'(data: RpcResponse): void
  'host:sync'(data: HostSync): void
}
