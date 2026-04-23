<template>
  <div class="tab-strip">
    <div
      class="strip-tab history-tab"
      :class="{ active: activeId === 'history' }"
      @click="$emit('switch', 'history')"
      title="History"
    >
      <k-icon name="http:history"/>
    </div>

    <div
      v-for="tab of tabs"
      :key="tab.id"
      class="strip-tab"
      :class="{ active: activeId === tab.id, dirty: dirty[tab.id] }"
      @click="$emit('switch', tab.id)"
      @contextmenu.stop="triggerTabMenu($event, tab)"
    >
      <span class="tab-method" :class="methodClass(tab.state.method)">{{ tab.state.method }}</span>
      <span class="tab-label">{{ labelFor(tab) }}</span>
      <button
        class="tab-close"
        @click.stop="$emit('close', tab.id)"
        title="Close"
      >
        <span class="tab-close-dot">●</span>
        <span class="tab-close-cross">×</span>
      </button>
    </div>

    <button class="strip-add" @click="$emit('new')" title="New Request">
      <k-icon name="add"/>
    </button>
  </div>
</template>

<script lang="ts" setup>

import { useMenu } from '@cordisjs/client'
import type { OpenTab, SavedRequest } from './types'

const props = defineProps<{
  tabs: OpenTab[]
  activeId: string
  savedMap: Record<string, SavedRequest>
  dirty: Record<string, boolean>
}>()

defineEmits<{
  (e: 'switch', id: string): void
  (e: 'close', id: string): void
  (e: 'new'): void
}>()

const triggerTabMenu = useMenu('httpTab')

function labelFor(tab: OpenTab) {
  if (tab.savedId && props.savedMap[tab.savedId]) return props.savedMap[tab.savedId].name
  const raw = tab.state.url
  if (!raw) return 'New Request'
  try {
    const u = new URL(raw)
    return u.host + u.pathname
  } catch {
    return raw
  }
}

function methodClass(method: string) {
  const m = method.toLowerCase()
  if (['get', 'post', 'put', 'delete', 'patch', 'head'].includes(m)) return 'method-' + m
  return 'method-other'
}

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
  padding: 0 10px 0 12px;
  max-width: 200px;
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

.history-tab {
  width: var(--tab-bar-height);
  padding: 0;
  justify-content: center;

  :deep(.k-icon) {
    width: 16px;
    height: 16px;
  }
}

.tab-method {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;

  &.method-get    { color: var(--accent); }
  &.method-post   { color: var(--success); }
  &.method-put    { color: var(--warning); }
  &.method-delete { color: var(--error); }
  &.method-patch  { color: var(--warning); }
  &.method-head   { color: var(--text-tertiary); }
  &.method-other  { color: var(--text-tertiary); }
}

.tab-label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
}

.tab-close {
  position: relative;
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--radius-sm);
  padding: 0;
  line-height: 1;

  .tab-close-dot,
  .tab-close-cross {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    transition: opacity 0.1s, color 0.1s;
  }

  .tab-close-dot {
    color: var(--accent);
    font-size: 8px;
    opacity: 0;
  }

  .tab-close-cross {
    color: var(--text-tertiary);
    font-size: 14px;
    opacity: 0;
  }

  &:hover {
    background: var(--bg-hover);

    .tab-close-cross {
      opacity: 1;
      color: var(--text-primary);
    }

    .tab-close-dot {
      opacity: 0;
    }
  }
}

// dirty (not hovering tab): show dot
.strip-tab.dirty .tab-close .tab-close-dot {
  opacity: 1;
}

// tab hover + not dirty: show dim cross
.strip-tab:hover:not(.dirty) .tab-close .tab-close-cross {
  opacity: 1;
}

.strip-add {
  flex: 0 0 auto;
  width: var(--tab-bar-height);
  height: var(--tab-bar-height);
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;

  :deep(.k-icon) {
    width: 14px;
    height: 14px;
  }

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
}

</style>
