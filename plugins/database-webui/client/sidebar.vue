<template>
  <aside class="page-sidebar db-sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">Tables</span>
      <span class="sidebar-count" v-if="tables.length">{{ tables.length }}</span>
    </div>
    <div class="sidebar-list">
      <div
        v-for="t of tables"
        :key="t.name"
        class="table-item"
        :class="{ active: activeTable === t.name }"
        @click="$emit('open', t.name)"
      >
        <span class="table-name">{{ t.name }}</span>
        <span class="table-count">{{ formatCount(t.count) }}</span>
      </div>
      <div v-if="!tables.length" class="sidebar-empty">
        没有已注册的表。
      </div>
    </div>
  </aside>
</template>

<script lang="ts" setup>

import type { TableInfo } from '../src'

defineProps<{
  tables: TableInfo[]
  activeTable: string
}>()

defineEmits<{
  (e: 'open', name: string): void
}>()

function formatCount(n: number) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
}

</script>

<style lang="scss" scoped>

.db-sidebar {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: var(--tab-bar-height);
  border-bottom: 1px solid var(--border-primary);
}

.sidebar-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.sidebar-count {
  font-size: 11px;
  color: var(--text-tertiary);
}

.sidebar-list {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 0;
}

.table-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  cursor: pointer;
  user-select: none;
  transition: var(--color-transition);

  &:hover {
    background: var(--bg-hover);
  }

  &.active {
    background: var(--accent-muted);
    color: var(--accent);
  }
}

.table-name {
  flex: 1 1 auto;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-item.active .table-name {
  color: var(--accent);
}

.table-count {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-tertiary);
}

.sidebar-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12px;
}

</style>
