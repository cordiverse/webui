import type { PersistedData } from './types'

const STORAGE_KEY = 'cordis.http-webui'
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
  } catch {
    // quota / privacy mode — silently ignore
  }
}

export function clear() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}
