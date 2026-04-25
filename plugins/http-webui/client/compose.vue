<template>
  <k-layout>
    <template #header>
      <span class="crumb">HTTP Compose</span>
    </template>

    <sidebar :saved="saved" @open="openSavedReq"/>

    <div class="content-area">
      <tab-strip
        :tabs="tabs"
        :active-id="activeTabId"
        :saved-map="savedMap"
        :dirty="dirty"
        @switch="switchTab"
        @close="requestCloseTab"
        @new="newTab"
      />

      <template v-for="tab of tabs" :key="tab.id">
        <tab
          v-show="activeTabId === tab.id"
          :state="tab.state"
          :save-tooltip="saveTooltip(tab)"
          @save="saveTab(tab.id)"
        />
      </template>

      <div v-if="!tabs.length" class="empty-hint">
        按 + 新建请求, 或从侧边栏打开已保存的请求
      </div>
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

import { onBeforeUnmount, reactive, watch } from 'vue'
import { useContext } from '@cordisjs/client'
import Sidebar from './sidebar.vue'
import TabStrip from './tab-strip.vue'
import Tab from './tab.vue'
import type { HistoryEntry } from '../src'
import {
  cloneTabState,
  type OpenTab,
  type SavedRequest,
  newId,
} from './types'
import {
  saved,
  tabs,
  activeTabId,
  savedMap,
  dirty,
  addTab,
  newTab,
  switchTab,
  openSaved,
  removeTab,
  deriveName,
  persistToStorage,
  pendingTab,
} from './state'

declare module '@cordisjs/client' {
  interface ActionContext {
    httpSaved: SavedRequest
    httpTab: OpenTab
    httpHistory: HistoryEntry
  }
}

const ctx = useContext()

onBeforeUnmount(persistToStorage)

function openSavedReq(savedId: string) {
  openSaved(savedId)
}

function saveTooltip(tab: OpenTab) {
  return dirty.value[tab.id] ? '保存 (Ctrl+S)' : '已保存'
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
  hidden: () => !tabs.value.some(t => t.id === activeTabId.value),
  action: () => saveTab(activeTabId.value),
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
    activeTabId.value = httpTab.id
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
    addTab(cloneTabState(httpTab.state))
  },
})

// --- consume pending tab from history page ---

watch(pendingTab, (pt) => {
  if (!pt) return
  const tab = addTab(pt.state)
  if (pt.openSaveDialog) {
    openSaveDialog(tab.id)
  }
  pendingTab.value = null
}, { immediate: true })

</script>

<style lang="scss" scoped>

.content-area {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.empty-hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

</style>
