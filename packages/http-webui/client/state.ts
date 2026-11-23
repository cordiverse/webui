import { computed, ref, watch } from 'vue'
import { deepEqual } from 'cosmokit'
import * as storage from './storage'
import {
  cloneTabState,
  emptyTabState,
  newId,
  type OpenTab,
  type SavedRequest,
  type TabState,
} from './types'

export const saved = ref<SavedRequest[]>([])
export const tabs = ref<OpenTab[]>([])
export const activeTabId = ref<string>('')

// Cross-page handoff: when set, the compose page picks it up and creates a
// new tab. `openSaveDialog` indicates whether the new tab should immediately
// open the save dialog after creation.
export interface PendingTab {
  state: TabState
  openSaveDialog?: boolean
}
export const pendingTab = ref<PendingTab | null>(null)

export const savedMap = computed<Record<string, SavedRequest>>(() => {
  const map: Record<string, SavedRequest> = {}
  for (const item of saved.value) map[item.id] = item
  return map
})

// Strip runtime-only fields so dirty comparison + persistence only see the
// saveable shape.
function toPersistable(state: TabState): TabState {
  return {
    method: state.method,
    url: state.url,
    headers: state.headers,
    query: state.query,
    body: state.body,
    bodyType: state.bodyType,
    formBody: state.formBody,
    events: state.events.map(ev => ({ ...ev, ts: 0 })),
    wsMessages: state.wsMessages
      .filter(m => m.direction === 'out' && m.persist)
      .map(m => ({ ...m, ts: 0 })),
  }
}

export const dirty = computed<Record<string, boolean>>(() => {
  const out: Record<string, boolean> = {}
  for (const tab of tabs.value) {
    const origin = tab.savedId ? savedMap.value[tab.savedId]?.state : undefined
    out[tab.id] = !origin || !deepEqual(toPersistable(origin), toPersistable(tab.state))
  }
  return out
})

function normalizeState(state: any) {
  if (!Array.isArray(state.events)) state.events = []
  if (!Array.isArray(state.wsMessages)) state.wsMessages = []
  for (const ev of state.events) ev.ts = 0
  state.wsMessages = state.wsMessages.filter((m: any) => m.direction === 'out' && m.persist)
  for (const m of state.wsMessages) m.ts = 0
}

let loaded = false
function loadFromStorage() {
  if (loaded) return
  loaded = true
  const persisted = storage.load()
  if (!persisted) return
  saved.value = persisted.saved ?? []
  tabs.value = persisted.tabs ?? []
  for (const item of saved.value) normalizeState(item.state)
  for (const tab of tabs.value) normalizeState(tab.state)
  activeTabId.value = persisted.activeId ?? ''
  if (activeTabId.value && !tabs.value.some(t => t.id === activeTabId.value)) {
    activeTabId.value = tabs.value[0]?.id ?? ''
  }
}

let ready = false

loadFromStorage()

// Only start persisting after the initial load is confirmed.
// This prevents HMR transitions from overwriting localStorage with empty
// data when the old component's onBeforeUnmount fires after module reload.
Promise.resolve().then(() => ready = true)

let saveTimer: number | undefined
watch([saved, tabs, activeTabId], () => {
  if (!ready) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(persistToStorage, 200)
}, { deep: true })

export function persistToStorage() {
  if (!ready) return
  storage.save({
    saved: saved.value.map(s => ({ ...s, state: toPersistable(s.state) })),
    tabs: tabs.value.map(t => ({ ...t, state: toPersistable(t.state) })),
    activeId: activeTabId.value,
  })
}

export function addTab(state: TabState, savedId?: string): OpenTab {
  const tab: OpenTab = { id: newId(), state, savedId }
  tabs.value.push(tab)
  activeTabId.value = tab.id
  return tab
}

export function newTab() {
  return addTab(emptyTabState())
}

export function switchTab(id: string) {
  activeTabId.value = id
}

export function openSaved(savedId: string) {
  const existing = tabs.value.find(t => t.savedId === savedId)
  if (existing) {
    activeTabId.value = existing.id
    return existing
  }
  const source = savedMap.value[savedId]
  if (!source) return
  return addTab(cloneTabState(source.state), savedId)
}

export function removeTab(id: string) {
  const idx = tabs.value.findIndex(t => t.id === id)
  if (idx < 0) return
  tabs.value.splice(idx, 1)
  if (activeTabId.value === id) {
    activeTabId.value = tabs.value[idx]?.id ?? tabs.value[idx - 1]?.id ?? ''
  }
}

export function deriveName(tab: OpenTab): string {
  const url = tab.state.url.trim()
  if (!url) return 'New Request'
  try {
    const u = new URL(url)
    return u.host + u.pathname
  } catch {
    return url
  }
}
