export interface PersistedTab {
  id: string
  table: string
  page: number
  pageSize: number
  sort?: { field: string; direction: 'asc' | 'desc' }
}

export interface PersistedData {
  version: number
  tabs: PersistedTab[]
  activeId: string
}

const STORAGE_KEY = 'cordis.database-webui'
const VERSION = 1

export function load(): PersistedData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as PersistedData
    if (data.version !== VERSION) return null
    return data
  } catch {
    return null
  }
}

export function save(data: Omit<PersistedData, 'version'>) {
  const payload: PersistedData = { version: VERSION, ...data }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {}
}
