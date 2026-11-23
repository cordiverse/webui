<template>
  <k-layout>
    <template #header>
      <span class="crumb">日志</span>
    </template>

    <template #menu>
      <span class="menu-item" :class="{ active: paused }" @click="paused = !paused" title="Pause / Resume">
        <k-icon class="menu-icon" :name="paused ? 'play' : 'pause'"/>
      </span>
      <span class="menu-item" @click="clear" title="Clear">
        <k-icon class="menu-icon" name="trash"/>
      </span>
      <span class="menu-item" @click="exportLogs" title="Export">
        <k-icon class="menu-icon" name="download"/>
      </span>
    </template>

    <div class="content-area">
      <div class="logger-toolbar">
        <div class="level-chips">
          <span
            v-for="level of levelOptions"
            :key="level.id"
            class="level-chip"
            :class="[level.id, { active: levels.includes(level.id) }]"
            @click="toggleLevel(level.id)"
          >{{ level.label }}</span>
        </div>
        <div class="search-wrapper">
          <k-icon name="search"/>
          <input class="search-input" v-model="input" placeholder="Search logs..."/>
        </div>
      </div>
      <logs class="layout-logger" :filter="filter" max-height="100%" show-link show-history></logs>
    </div>
  </k-layout>
</template>

<script lang="ts" setup>

import { ref } from 'vue'
import type { Message } from 'cordis'
import Logs from './logs.vue'

const input = ref('')
const paused = ref(false)
const clearCutoffTs = ref(0)

const levelOptions = [
  { id: 'info', label: 'Info' },
  { id: 'success', label: 'Success' },
  { id: 'warn', label: 'Warn' },
  { id: 'error', label: 'Error' },
  { id: 'debug', label: 'Debug' },
]

const levels = ref<string[]>(levelOptions.map(l => l.id))

function toggleLevel(id: string) {
  const idx = levels.value.indexOf(id)
  if (idx >= 0) {
    levels.value.splice(idx, 1)
  } else {
    levels.value.push(id)
  }
}

function filter(record: Message) {
  if (record.ts !== undefined && record.ts <= clearCutoffTs.value) return false
  if (!levels.value.includes(record.type)) return false
  if (input.value && !record.body.includes(input.value)) return false
  return true
}

function clear() {
  clearCutoffTs.value = Date.now()
}

function exportLogs() {
  const lines = document.querySelectorAll('.layout-logger .log-list code')
  const text = Array.from(lines).map(l => (l as HTMLElement).innerText).join('\n')
  if (!text) return
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cordis-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

</script>

<style lang="scss" scoped>

.logger-toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-secondary);
}

.level-chips {
  display: flex;
  gap: 6px;
}

.level-chip {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-tertiary);
  cursor: pointer;
  border: 1px solid transparent;
  transition: var(--color-transition);
  user-select: none;

  &:hover {
    color: var(--text-primary);
  }

  &.active {
    color: var(--text-primary);
    background: var(--bg-hover);
    border-color: var(--border-primary);
  }

  &.active.info    { color: var(--accent);  }
  &.active.success { color: var(--success); }
  &.active.warn    { color: var(--warning); }
  &.active.error   { color: var(--error);   }
  &.active.debug   { color: var(--text-secondary); }
}

.search-wrapper {
  position: relative;
  margin-left: auto;

  :deep(svg), :deep(.k-icon) {
    position: absolute;
    left: 9px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-tertiary);
    width: 15px;
    height: 15px;
  }
}

.search-input {
  width: 240px;
  height: 30px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  padding: 0 10px 0 30px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s ease;
  font-family: var(--font-sans);

  &:focus {
    border-color: var(--border-focus);
  }
}

.layout-logger {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

</style>
