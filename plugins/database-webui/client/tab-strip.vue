<template>
  <div class="tab-strip">
    <div
      v-for="tab of tabs"
      :key="tab.id"
      class="strip-tab"
      :class="{ active: activeId === tab.id }"
      @click="$emit('switch', tab.id)"
      @contextmenu.stop="triggerTabMenu($event, tab)"
    >
      <span class="tab-label">{{ tab.table }}</span>
      <button
        class="tab-close"
        @click.stop="$emit('close', tab.id)"
        title="Close"
      >×</button>
    </div>

    <div v-if="!tabs.length" class="strip-empty">
      点击左侧的表打开新标签
    </div>
  </div>
</template>

<script lang="ts" setup>

import { useMenu } from '@cordisjs/client'
import type { TableTab } from './state'

defineProps<{
  tabs: TableTab[]
  activeId: string
}>()

defineEmits<{
  (e: 'switch', id: string): void
  (e: 'close', id: string): void
}>()

const triggerTabMenu = useMenu('databaseTab')

</script>

<style lang="scss" scoped>

.tab-strip {
  flex: 0 0 auto;
  display: flex;
  align-items: stretch;
  height: var(--tab-bar-height);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

.strip-tab {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px 0 12px;
  max-width: 220px;
  font-size: 12px;
  color: var(--text-tertiary);
  cursor: pointer;
  border-right: 1px solid var(--border-primary);
  user-select: none;
  position: relative;

  &.active {
    color: var(--text-primary);
    background: var(--bg-primary);

    &::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 2px;
      background: var(--accent);
    }
  }

  &:hover:not(.active) {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
}

.tab-label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
}

.tab-close {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.1s;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}

.strip-tab:hover .tab-close,
.strip-tab.active .tab-close {
  opacity: 1;
}

.strip-empty {
  display: flex;
  align-items: center;
  padding: 0 16px;
  font-size: 12px;
  color: var(--text-tertiary);
}

</style>
