export interface EntryData {
  files: string[]
  entryId?: string
  data?: any
}

export interface EntryInit {
  entries: Dict<EntryData>
  serverId: string
  clientId: string
}

export interface EntryUpdate extends EntryData {
  id: string
}

export interface EntryPatch extends EntryData {
  id: string
  key?: string
}

export interface Events {
  'entry:init'(data: EntryInit): void
  'entry:update'(data: EntryUpdate): void
  'entry:patch'(data: EntryPatch): void
}
