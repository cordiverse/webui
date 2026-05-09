<template>
  <k-layout>
    <template #header>
      <span class="crumb">Database</span>
      <span class="crumb-sub" v-if="data">
        {{ data.tables.length }} 张表
      </span>
    </template>

    <template #menu>
      <span class="menu-item" @click="refresh" title="刷新">
        <k-icon class="menu-icon" name="refresh"/>
      </span>
    </template>

    <sidebar :tables="tables" :active-table="activeTable" @open="openTable"/>

    <div class="content-area">
      <tab-strip
        :tabs="tabs"
        :active-id="activeId"
        @switch="switchTab"
        @close="closeTab"
      />

      <template v-for="tab of tabs" :key="tab.id">
        <table-view
          v-show="activeId === tab.id"
          :tab="tab"
          :info="infoFor(tab.table)"
        />
      </template>

      <div v-if="!tabs.length" class="placeholder">
        从左侧选择一张表开始浏览。
      </div>
    </div>
  </k-layout>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import { useContext, useRpc } from '@cordisjs/client'
import Sidebar from './sidebar.vue'
import TabStrip from './tab-strip.vue'
import TableView from './table-view.vue'
import type { Data, TableInfo } from '../src'
import {
  activeId,
  closeTab as closeTabState,
  cloneTab,
  openTable as openTableState,
  switchTab,
  tabs,
  type TableTab,
} from './state'

declare module '@cordisjs/client' {
  interface ActionContext {
    databaseTab: TableTab
  }
}

const ctx = useContext()
const data = useRpc<Data>()

const tables = computed<TableInfo[]>(() => data.value?.tables ?? [])
const tablesMap = computed(() => {
  const map: Record<string, TableInfo> = {}
  for (const t of tables.value) map[t.name] = t
  return map
})

const activeTable = computed(() => {
  const tab = tabs.value.find(t => t.id === activeId.value)
  return tab?.table ?? ''
})

function infoFor(name: string) {
  return tablesMap.value[name]
}

function openTable(name: string) {
  openTableState(name)
}

function closeTab(id: string) {
  closeTabState(id)
}

ctx.client.action.menu('databaseTab', [
  { id: '.close', label: '关闭' },
  { id: '.closeOthers', label: '关闭其他' },
  { id: '.closeAll', label: '全部关闭' },
  { id: '@separator' },
  { id: '.clone', label: '复制新建' },
])

ctx.client.action.action('databaseTab.close', {
  action: ({ databaseTab }: any) => databaseTab && closeTabState(databaseTab.id),
})

ctx.client.action.action('databaseTab.closeOthers', {
  action: ({ databaseTab }: any) => {
    if (!databaseTab) return
    const ids = tabs.value.filter(t => t.id !== databaseTab.id).map(t => t.id)
    for (const id of ids) closeTabState(id)
    activeId.value = databaseTab.id
  },
})

ctx.client.action.action('databaseTab.closeAll', {
  action: () => {
    const ids = tabs.value.map(t => t.id)
    for (const id of ids) closeTabState(id)
  },
})

ctx.client.action.action('databaseTab.clone', {
  action: ({ databaseTab }: any) => databaseTab && cloneTab(databaseTab.id),
})

</script>

<style lang="scss" scoped>

.crumb-sub {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 400;
  margin-left: 6px;
}

.content-area {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.placeholder {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

</style>
