<template>
  <div class="http-history">
    <div class="history-toolbar">
      <div class="method-filter">
        <button
          v-for="m of methodOptions"
          :key="m.id"
          class="method-btn"
          :class="{ active: activeMethod === m.id }"
          @click="activeMethod = m.id"
        >{{ m.label }}</button>
      </div>

      <select class="source-filter" v-model="activeSource">
        <option value="">All Plugins</option>
        <option v-for="src of sources" :key="src" :value="src">{{ src }}</option>
      </select>

      <select class="source-filter" v-model="activeStatus">
        <option value="">All Status</option>
        <option value="2xx">2xx</option>
        <option value="3xx">3xx</option>
        <option value="4xx">4xx</option>
        <option value="5xx">5xx</option>
      </select>

      <div style="flex: 1"></div>

      <div class="search-wrapper">
        <k-icon name="search"/>
        <input class="search-input" v-model="searchInput" placeholder="Filter by URL..."/>
      </div>

      <button class="btn-icon" title="Clear" @click="clearHistory">
        <k-icon name="trash"/>
      </button>
    </div>

    <div class="hist-header">
      <span class="col-method">Method</span>
      <span class="col-status">Status</span>
      <span class="col-url">URL</span>
      <span class="col-plugin">Plugin</span>
      <span class="col-latency">Latency</span>
      <span class="col-size">Size</span>
      <span class="col-time">Time</span>
    </div>

    <div class="history-list">
      <div
        v-for="entry of filtered"
        :key="entry.id"
        class="hist-row"
        :class="{ active: selected?.id === entry.id }"
        @click="selected = entry"
      >
        <span class="col-method method-badge" :class="methodClass(entry.method)">{{ entry.method }}</span>
        <span class="col-status status-code" :class="statusClass(entry.status)">{{ entry.status || '—' }}</span>
        <span class="col-url hist-url">{{ entry.url }}</span>
        <span class="col-plugin hist-source">{{ entry.source || 'unknown' }}</span>
        <span class="col-latency hist-latency">{{ formatLatency(entry.latency) }}</span>
        <span class="col-size hist-size">{{ formatSize(entry.size) }}</span>
        <span class="col-time hist-time">{{ formatTime(entry.ts) }}</span>
      </div>
      <div v-if="!filtered.length" class="hist-empty">
        <span v-if="history.length">没有匹配的请求</span>
        <span v-else>暂无请求记录</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>

import { computed, ref } from 'vue'
import { send, useRpc } from '@cordisjs/client'
import type { Data, HistoryEntry } from '../src'

const data = useRpc<Data>()
const history = computed<HistoryEntry[]>(() => data.value?.history ?? [])

const methodOptions = [
  { id: '', label: 'ALL' },
  { id: 'GET', label: 'GET' },
  { id: 'POST', label: 'POST' },
  { id: 'PUT', label: 'PUT' },
  { id: 'DELETE', label: 'DEL' },
  { id: 'PATCH', label: 'PATCH' },
]

const activeMethod = ref('')
const activeSource = ref('')
const activeStatus = ref('')
const searchInput = ref('')
const selected = ref<HistoryEntry | null>(null)

const sources = computed(() => {
  const set = new Set<string>()
  for (const entry of history.value) {
    if (entry.source) set.add(entry.source)
  }
  return [...set].sort()
})

const filtered = computed(() => {
  return [...history.value].reverse().filter((entry) => {
    if (activeMethod.value && entry.method !== activeMethod.value) return false
    if (activeSource.value && entry.source !== activeSource.value) return false
    if (activeStatus.value) {
      const bucket = Math.floor(entry.status / 100) + 'xx'
      if (bucket !== activeStatus.value) return false
    }
    if (searchInput.value && !entry.url.toLowerCase().includes(searchInput.value.toLowerCase())) return false
    return true
  })
})

function methodClass(method: string) {
  const m = method.toLowerCase()
  if (['get', 'post', 'put', 'delete', 'patch'].includes(m)) return 'method-' + m
  return 'method-other'
}

function statusClass(status: number) {
  if (!status) return 'status-err'
  const bucket = Math.floor(status / 100)
  return 'status-' + bucket + 'xx'
}

function formatLatency(ms: number) {
  if (ms < 1000) return ms + 'ms'
  return (ms / 1000).toFixed(1) + 's'
}

function formatSize(bytes: number) {
  if (!bytes) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toTimeString().slice(0, 8)
}

function clearHistory() {
  send('http-webui.clear')
}

</script>

<style lang="scss" scoped>

.http-history {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.history-toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-secondary);
}

.method-filter {
  display: flex;
  gap: 2px;
}

.method-btn {
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--border-primary);
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  transition: var(--color-transition);

  &.active {
    background: var(--accent-muted);
    color: var(--accent);
    border-color: var(--accent);
  }

  &:hover:not(.active) {
    background: var(--bg-hover);
  }
}

.source-filter {
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  border: 1px solid var(--border-primary);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  outline: none;
  cursor: pointer;
  appearance: none;
  height: 28px;
}

.search-wrapper {
  position: relative;
  width: 240px;

  :deep(.k-icon) {
    position: absolute;
    left: 9px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-tertiary);
    width: 15px;
    height: 15px;
    pointer-events: none;
  }
}

.search-input {
  width: 100%;
  height: 28px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  padding: 0 10px 0 30px;
  font-size: 12px;
  color: var(--text-primary);
  outline: none;
  font-family: var(--font-sans);

  &:focus {
    border-color: var(--border-focus);
  }
}

.btn-icon {
  width: 28px;
  height: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-primary);
  cursor: pointer;

  :deep(.k-icon) {
    width: 14px;
    height: 14px;
  }

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}

.hist-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 24px;
  font-size: 11px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 500;
  border-bottom: 1px solid var(--border-secondary);
  background: var(--bg-secondary);
}

.history-list {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}

.hist-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 24px;
  border-bottom: 1px solid var(--border-primary);
  font-size: 13px;
  transition: background 0.1s;
  cursor: pointer;

  &:hover {
    background: var(--bg-hover);
  }

  &.active {
    background: var(--accent-muted);
  }
}

.col-method { min-width: 52px; }
.col-status { min-width: 40px; }
.col-url    { flex: 1; min-width: 0; }
.col-plugin { min-width: 100px; }
.col-latency { min-width: 60px; text-align: right; }
.col-size   { min-width: 60px; text-align: right; }
.col-time   { min-width: 80px; text-align: right; }

.method-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: 700;
  font-family: var(--font-mono);
  text-align: center;

  &.method-get    { background: var(--accent-muted);  color: var(--accent); }
  &.method-post   { background: var(--success-muted); color: var(--success); }
  &.method-put    { background: var(--warning-muted); color: var(--warning); }
  &.method-delete { background: var(--error-muted);   color: var(--error); }
  &.method-patch  { background: var(--warning-muted); color: var(--warning); }
  &.method-other  { background: var(--bg-hover);      color: var(--text-secondary); }
}

.status-code {
  display: inline-flex;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 500;
  font-family: var(--font-mono);

  &.status-2xx { background: var(--success-muted); color: var(--success); }
  &.status-3xx { background: var(--accent-muted);  color: var(--accent); }
  &.status-4xx { background: var(--warning-muted); color: var(--warning); }
  &.status-5xx { background: var(--error-muted);   color: var(--error); }
  &.status-err { background: var(--error-muted);   color: var(--error); }
}

.hist-url {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hist-source {
  font-size: 11px;
  color: var(--text-tertiary);
  padding: 2px 8px;
  background: var(--bg-tertiary);
  border-radius: 10px;
  white-space: nowrap;
}

.hist-latency { font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary); }
.hist-size { font-size: 12px; color: var(--text-tertiary); }
.hist-time { font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); }

.hist-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--text-tertiary);
  font-size: 13px;
}

</style>
