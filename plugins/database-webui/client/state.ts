import { reactive, ref, watch } from 'vue'
import * as storage from './storage'
import type { PersistedTab } from './storage'
import type { QueryResult } from '../src'

export interface TableTab extends PersistedTab {}

export function newId() {
  return Math.random().toString(36).slice(2, 10)
}

export const tabs = ref<TableTab[]>([])
export const activeId = ref<string>('')

// in-memory row cache, keyed by `${table}|${field}|${dir}|${page}|${pageSize}`.
// Wrapped in reactive() so that .set/.delete trigger Vue updates.
export const rowCache = reactive(new Map<string, QueryResult>())

export function cacheKey(tab: Pick<TableTab, 'table' | 'page' | 'pageSize' | 'sort'>) {
  const f = tab.sort?.field ?? ''
  const d = tab.sort?.direction ?? ''
  return `${tab.table}|${f}|${d}|${tab.page}|${tab.pageSize}`
}

export function invalidateTable(table: string) {
  for (const key of [...rowCache.keys()]) {
    if (key.startsWith(table + '|')) rowCache.delete(key)
  }
}

let loaded = false
function loadFromStorage() {
  if (loaded) return
  loaded = true
  const persisted = storage.load()
  if (!persisted) return
  tabs.value = persisted.tabs ?? []
  activeId.value = persisted.activeId ?? ''
  if (activeId.value && !tabs.value.some(t => t.id === activeId.value)) {
    activeId.value = tabs.value[0]?.id ?? ''
  }
}

let ready = false
loadFromStorage()
Promise.resolve().then(() => ready = true)

let saveTimer: number | undefined
watch([tabs, activeId], () => {
  if (!ready) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(persist, 200)
}, { deep: true })

function persist() {
  storage.save({
    tabs: tabs.value.map(({ id, table, page, pageSize, sort }) => ({ id, table, page, pageSize, sort })),
    activeId: activeId.value,
  })
}

export const DEFAULT_PAGE_SIZE = 50

export function openTable(table: string) {
  const existing = tabs.value.find(t => t.table === table)
  if (existing) {
    activeId.value = existing.id
    return existing
  }
  return addTab(table)
}

export function addTab(table: string): TableTab {
  const tab: TableTab = {
    id: newId(),
    table,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  }
  tabs.value.push(tab)
  activeId.value = tab.id
  return tab
}

export function switchTab(id: string) {
  activeId.value = id
}

export function closeTab(id: string) {
  const idx = tabs.value.findIndex(t => t.id === id)
  if (idx < 0) return
  tabs.value.splice(idx, 1)
  if (activeId.value === id) {
    activeId.value = tabs.value[idx]?.id ?? tabs.value[idx - 1]?.id ?? ''
  }
}

export function cloneTab(id: string) {
  const src = tabs.value.find(t => t.id === id)
  if (!src) return
  const tab: TableTab = { ...src, id: newId() }
  tabs.value.push(tab)
  activeId.value = tab.id
  return tab
}
