<template>
  <aside class="page-sidebar http-sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">已保存的请求</span>
    </div>
    <div class="sidebar-list">
      <div
        v-for="item of saved"
        :key="item.id"
        class="saved-item"
        @click="$emit('open', item.id)"
        @contextmenu.stop="trigger($event, item)"
      >
        <span class="saved-method" :class="methodClass(item.state.method)">
          {{ item.state.method }}
        </span>
        <span class="saved-name">{{ item.name }}</span>
      </div>
      <div v-if="!saved.length" class="sidebar-empty">
        还没有保存的请求。
      </div>
    </div>
  </aside>
</template>

<script lang="ts" setup>

import { useMenu } from '@cordisjs/client'
import type { SavedRequest } from './types'

defineProps<{
  saved: SavedRequest[]
}>()

defineEmits<{
  (e: 'open', id: string): void
}>()

const trigger = useMenu('httpSaved')

function methodClass(method: string) {
  const m = method.toLowerCase()
  if (['get', 'post', 'put', 'delete', 'patch', 'head'].includes(m)) return 'method-' + m
  return 'method-other'
}

</script>

<style lang="scss" scoped>

.http-sidebar {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
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

.sidebar-list {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 0;
}

.saved-item {
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
}

.saved-method {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
  min-width: 36px;

  &.method-get    { color: var(--accent); }
  &.method-post   { color: var(--success); }
  &.method-put    { color: var(--warning); }
  &.method-delete { color: var(--error); }
  &.method-patch  { color: var(--warning); }
  &.method-head   { color: var(--text-tertiary); }
  &.method-other  { color: var(--text-tertiary); }
}

.saved-name {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--text-primary);
}

.sidebar-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12px;
}

</style>
