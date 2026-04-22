export type BodyType = 'none' | 'json' | 'xml' | 'formdata' | 'urlencoded'

export interface KvRow {
  enabled: boolean
  key: string
  value: string
}

export interface TabState {
  method: string
  url: string
  headers: KvRow[]
  query: KvRow[]
  body: string
  bodyType: BodyType
  formBody: KvRow[]
}

export interface SavedRequest {
  id: string
  name: string
  state: TabState
  createdAt: number
}

export interface OpenTab {
  id: string
  savedId?: string
  state: TabState
}

export interface PersistedData {
  version: number
  saved: SavedRequest[]
  tabs: OpenTab[]
  activeId: string
}

export function emptyKvRow(): KvRow {
  return { enabled: true, key: '', value: '' }
}

export function emptyTabState(): TabState {
  return {
    method: 'GET',
    url: '',
    headers: [emptyKvRow()],
    query: [emptyKvRow()],
    body: '',
    bodyType: 'none',
    formBody: [emptyKvRow()],
  }
}

export function cloneTabState(state: TabState): TabState {
  return JSON.parse(JSON.stringify(state))
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
