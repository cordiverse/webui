<template>
  <k-layout>
    <template #header>
      <span class="crumb">HTTP Client</span>
    </template>

    <sidebar :saved="saved" @open="openSaved"/>

    <div class="content-area">
      <tab-strip
        :tabs="tabs"
        :active-id="activeId"
        :saved-map="savedMap"
        :dirty="dirty"
        @switch="switchTab"
        @close="requestCloseTab"
        @new="newTab"
      />

      <history v-show="activeId === 'history'"/>
      <template v-for="tab of tabs" :key="tab.id">
        <tab
          v-show="activeId === tab.id"
          :state="tab.state"
          :save-tooltip="saveTooltip(tab)"
          @save="saveTab(tab.id)"
        />
      </template>
    </div>

    <el-dialog v-model="saveDialog.open" title="保存请求" destroy-on-close width="360px">
      <el-input
        v-model="saveDialog.name"
        placeholder="请求名称"
        @keyup.enter="confirmSave"
        autofocus
      />
      <template #footer>
        <el-button @click="saveDialog.open = false">取消</el-button>
        <el-button type="primary" :disabled="!saveDialog.name.trim()" @click="confirmSave">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="renameDialog.open" title="重命名" destroy-on-close width="360px">
      <el-input
        v-model="renameDialog.name"
        placeholder="请求名称"
        @keyup.enter="confirmRename"
        autofocus
      />
      <template #footer>
        <el-button @click="renameDialog.open = false">取消</el-button>
        <el-button type="primary" :disabled="!renameDialog.name.trim()" @click="confirmRename">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="closeDialog.open" title="未保存的更改" destroy-on-close width="400px">
      <p>是否保存对「{{ closeDialog.label }}」的修改？</p>
      <template #footer>
        <el-button @click="closeDialog.open = false">取消</el-button>
        <el-button @click="closeConfirm('discard')">不保存</el-button>
        <el-button type="primary" @click="closeConfirm('save')">保存</el-button>
      </template>
    </el-dialog>
  </k-layout>
</template>

<script lang="ts" setup>

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { deepEqual } from 'cosmokit'
import { useContext } from '@cordisjs/client'
import Sidebar from './sidebar.vue'
import TabStrip from './tab-strip.vue'
import Tab from './tab.vue'
import History from './history.vue'
import * as storage from './storage'
import type { HistoryEntry } from '../src'
import {
  cloneTabState,
  emptyKvRow,
  emptyTabState,
  newId,
  type OpenTab,
  type SavedRequest,
  type TabState,
} from './types'

declare module '@cordisjs/client' {
  interface ActionContext {
    httpSaved: SavedRequest
    httpTab: OpenTab
    httpHistory: HistoryEntry
  }
}

const ctx = useContext()

const saved = ref<SavedRequest[]>([])
const tabs = ref<OpenTab[]>([])
const activeId = ref<string>('history')

const savedMap = computed<Record<string, SavedRequest>>(() => {
  const map: Record<string, SavedRequest> = {}
  for (const item of saved.value) map[item.id] = item
  return map
})

// strip runtime-only fields so dirty comparison + persistence only see the saveable shape
function toPersistable(state: TabState): TabState {
  return {
    method: state.method,
    url: state.url,
    headers: state.headers,
    query: state.query,
    body: state.body,
    bodyType: state.bodyType,
    formBody: state.formBody,
    // ts is runtime-only
    events: state.events.map(ev => ({ ...ev, ts: 0 })),
    // keep only persisted outbound, drop ts
    wsMessages: state.wsMessages
      .filter(m => m.direction === 'out' && m.persist)
      .map(m => ({ ...m, ts: 0 })),
  }
}

const dirty = computed<Record<string, boolean>>(() => {
  const out: Record<string, boolean> = {}
  for (const tab of tabs.value) {
    const origin = tab.savedId ? savedMap.value[tab.savedId]?.state : undefined
    out[tab.id] = !origin || !deepEqual(toPersistable(origin), toPersistable(tab.state))
  }
  return out
})

function saveTooltip(tab: OpenTab) {
  return dirty.value[tab.id] ? '保存 (Ctrl+S)' : '已保存'
}

// --- initial load ---

function normalizeState(state: any) {
  if (!Array.isArray(state.events)) state.events = []
  if (!Array.isArray(state.wsMessages)) state.wsMessages = []
  // ts is runtime-only (indicates "was sent in this session"); wipe on load
  for (const ev of state.events) ev.ts = 0
  // keep only persisted out messages; reset ts so they re-queue on next connect
  state.wsMessages = state.wsMessages.filter((m: any) => m.direction === 'out' && m.persist)
  for (const m of state.wsMessages) m.ts = 0
}

const persisted = storage.load()
if (persisted) {
  saved.value = persisted.saved ?? []
  tabs.value = persisted.tabs ?? []
  for (const item of saved.value) normalizeState(item.state)
  for (const tab of tabs.value) normalizeState(tab.state)
  activeId.value = persisted.activeId ?? 'history'
  // validate activeId
  if (activeId.value !== 'history' && !tabs.value.some(t => t.id === activeId.value)) {
    activeId.value = tabs.value[0]?.id ?? 'history'
  }
}

// --- persistence ---

let saveTimer: number | undefined
watch([saved, tabs, activeId], () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(persistToStorage, 200)
}, { deep: true })

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
  persistToStorage()
})

function persistToStorage() {
  storage.save({
    saved: saved.value.map(s => ({ ...s, state: toPersistable(s.state) })),
    tabs: tabs.value.map(t => ({ ...t, state: toPersistable(t.state) })),
    activeId: activeId.value,
  })
}

// --- tab / saved operations ---

function newTab() {
  const tab: OpenTab = { id: newId(), state: emptyTabState() }
  tabs.value.push(tab)
  activeId.value = tab.id
}

function switchTab(id: string) {
  activeId.value = id
}

function openSaved(savedId: string) {
  const existing = tabs.value.find(t => t.savedId === savedId)
  if (existing) {
    activeId.value = existing.id
    return
  }
  const source = savedMap.value[savedId]
  if (!source) return
  const tab: OpenTab = {
    id: newId(),
    savedId,
    state: cloneTabState(source.state),
  }
  tabs.value.push(tab)
  activeId.value = tab.id
}

function removeTab(id: string) {
  const idx = tabs.value.findIndex(t => t.id === id)
  if (idx < 0) return
  tabs.value.splice(idx, 1)
  if (activeId.value === id) {
    activeId.value = tabs.value[idx]?.id ?? tabs.value[idx - 1]?.id ?? 'history'
  }
}

// --- save dialog ---

const saveDialog = reactive({
  open: false,
  name: '',
  tabId: '',
  resolve: null as ((saved: boolean) => void) | null,
})

function openSaveDialog(tabId: string, resolve?: (saved: boolean) => void) {
  const tab = tabs.value.find(t => t.id === tabId)
  if (!tab) {
    resolve?.(false)
    return
  }
  saveDialog.tabId = tabId
  saveDialog.name = deriveName(tab)
  saveDialog.resolve = resolve ?? null
  saveDialog.open = true
}

function deriveName(tab: OpenTab): string {
  const url = tab.state.url.trim()
  if (!url) return 'New Request'
  try {
    const u = new URL(url)
    return u.host + u.pathname
  } catch {
    return url
  }
}

function confirmSave() {
  const name = saveDialog.name.trim()
  if (!name) return
  const tab = tabs.value.find(t => t.id === saveDialog.tabId)
  if (!tab) {
    saveDialog.open = false
    return
  }
  const item: SavedRequest = {
    id: newId(),
    name,
    state: cloneTabState(tab.state),
    createdAt: Date.now(),
  }
  saved.value.push(item)
  tab.savedId = item.id
  const resolve = saveDialog.resolve
  saveDialog.resolve = null
  saveDialog.open = false
  resolve?.(true)
}

watch(() => saveDialog.open, (open) => {
  if (!open && saveDialog.resolve) {
    const resolve = saveDialog.resolve
    saveDialog.resolve = null
    resolve(false)
  }
})

function saveTab(tabId: string) {
  const tab = tabs.value.find(t => t.id === tabId)
  if (!tab) return
  if (tab.savedId) {
    const target = saved.value.find(s => s.id === tab.savedId)
    if (target) {
      target.state = cloneTabState(tab.state)
      return
    }
  }
  openSaveDialog(tabId)
}

ctx.client.action.action('httpCompose.save', {
  shortcut: 'ctrl+s',
  hidden: () => activeId.value === 'history' || !tabs.value.some(t => t.id === activeId.value),
  action: () => saveTab(activeId.value),
})

// --- close confirm dialog ---

const closeDialog = reactive({
  open: false,
  tabId: '',
  label: '',
})

function requestCloseTab(id: string) {
  const tab = tabs.value.find(t => t.id === id)
  if (!tab) return
  if (!dirty.value[id]) {
    removeTab(id)
    return
  }
  closeDialog.tabId = id
  closeDialog.label = tab.savedId ? savedMap.value[tab.savedId]?.name ?? deriveName(tab) : deriveName(tab)
  closeDialog.open = true
}

function closeConfirm(action: 'save' | 'discard') {
  const tabId = closeDialog.tabId
  closeDialog.open = false
  if (action === 'discard') {
    removeTab(tabId)
    return
  }
  // save path: reuse saveTab; if already has savedId it's immediate
  const tab = tabs.value.find(t => t.id === tabId)
  if (!tab) return
  if (tab.savedId) {
    const target = saved.value.find(s => s.id === tab.savedId)
    if (target) target.state = cloneTabState(tab.state)
    removeTab(tabId)
    return
  }
  openSaveDialog(tabId, (ok) => {
    if (ok) removeTab(tabId)
  })
}

// --- rename / delete ---

const renameDialog = reactive({
  open: false,
  savedId: '',
  name: '',
})

ctx.client.action.menu('httpSaved', [
  { id: '.rename', label: '重命名' },
  { id: '.delete', label: '删除', type: 'danger' },
])

ctx.client.action.action('httpSaved.rename', {
  action: ({ httpSaved }: any) => {
    if (!httpSaved) return
    renameDialog.savedId = httpSaved.id
    renameDialog.name = httpSaved.name
    renameDialog.open = true
  },
})

ctx.client.action.action('httpSaved.delete', {
  action: ({ httpSaved }: any) => {
    if (!httpSaved) return
    const idx = saved.value.findIndex(s => s.id === httpSaved.id)
    if (idx < 0) return
    saved.value.splice(idx, 1)
    for (const tab of tabs.value) {
      if (tab.savedId === httpSaved.id) tab.savedId = undefined
    }
  },
})

function confirmRename() {
  const name = renameDialog.name.trim()
  if (!name) return
  const target = saved.value.find(s => s.id === renameDialog.savedId)
  if (target) target.name = name
  renameDialog.open = false
}

// --- tab context menu ---

ctx.client.action.menu('httpTab', [
  { id: '.close', label: '关闭' },
  { id: '.closeOthers', label: '关闭其他' },
  { id: '.closeRight', label: '关闭右侧' },
  { id: '.closeAll', label: '全部关闭' },
  { id: '@separator' },
  { id: '.clone', label: '复制新建' },
])

ctx.client.action.action('httpTab.close', {
  action: ({ httpTab }: any) => httpTab && requestCloseTab(httpTab.id),
})

ctx.client.action.action('httpTab.closeOthers', {
  action: ({ httpTab }: any) => {
    if (!httpTab) return
    const ids = tabs.value.filter(t => t.id !== httpTab.id).map(t => t.id)
    for (const id of ids) removeTab(id)
    activeId.value = httpTab.id
  },
})

ctx.client.action.action('httpTab.closeRight', {
  action: ({ httpTab }: any) => {
    if (!httpTab) return
    const idx = tabs.value.findIndex(t => t.id === httpTab.id)
    if (idx < 0) return
    const ids = tabs.value.slice(idx + 1).map(t => t.id)
    for (const id of ids) removeTab(id)
  },
})

ctx.client.action.action('httpTab.closeAll', {
  action: () => {
    const ids = tabs.value.map(t => t.id)
    for (const id of ids) removeTab(id)
  },
})

ctx.client.action.action('httpTab.clone', {
  action: ({ httpTab }: any) => {
    if (!httpTab) return
    const tab: OpenTab = {
      id: newId(),
      state: cloneTabState(httpTab.state),
    }
    tabs.value.push(tab)
    activeId.value = tab.id
  },
})

// --- history context menu ---

function kvFromDict(dict: Record<string, string> | undefined) {
  const rows = Object.entries(dict ?? {}).map(([key, value]) => ({ enabled: true, key, value }))
  rows.push(emptyKvRow())
  return rows
}

function stateFromHistory(entry: HistoryEntry): TabState {
  let url = entry.url
  let query = [emptyKvRow()]
  try {
    const u = new URL(entry.url)
    const params: Record<string, string> = {}
    for (const [k, v] of u.searchParams) params[k] = v
    query = kvFromDict(params)
    u.search = ''
    url = u.href.replace(/\?$/, '')
  } catch {}
  return {
    method: entry.method,
    url,
    headers: kvFromDict(entry.requestHeaders),
    query,
    body: '',
    bodyType: 'none',
    formBody: [emptyKvRow()],
    events: [],
    wsMessages: [],
  }
}

ctx.client.action.menu('httpHistory', [
  { id: '.open', label: '在新标签页中打开' },
  { id: '.save', label: '保存此请求' },
])

ctx.client.action.action('httpHistory.open', {
  action: ({ httpHistory }: any) => {
    if (!httpHistory) return
    const tab: OpenTab = {
      id: newId(),
      state: stateFromHistory(httpHistory),
    }
    tabs.value.push(tab)
    activeId.value = tab.id
  },
})

ctx.client.action.action('httpHistory.save', {
  action: ({ httpHistory }: any) => {
    if (!httpHistory) return
    const tab: OpenTab = {
      id: newId(),
      state: stateFromHistory(httpHistory),
    }
    tabs.value.push(tab)
    activeId.value = tab.id
    openSaveDialog(tab.id)
  },
})

</script>

<style lang="scss" scoped>

.content-area {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

</style>
