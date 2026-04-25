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
        <option v-for="src of sources" :key="src" :value="src">{{ pluginLabel(src) }}</option>
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
    </div>

    <div class="history-list">
      <table class="hist-table">
        <colgroup>
          <col class="col-method"/>
          <col class="col-status"/>
          <col class="col-url"/>
          <col class="col-plugin"/>
          <col class="col-latency"/>
          <col class="col-size"/>
          <col class="col-time"/>
        </colgroup>
        <thead>
          <tr>
            <th>Method</th>
            <th>Status</th>
            <th class="text-left">URL</th>
            <th class="text-left">Plugin</th>
            <th class="text-center">Duration</th>
            <th class="text-center">Size</th>
            <th class="text-center">Time</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry of filtered"
            :key="entry.id"
            class="hist-row"
            :class="{ active: selected?.id === entry.id, pending: !entry.endTime }"
            @click="selected = entry"
            @contextmenu.stop="triggerHistoryMenu($event, entry)"
          >
            <td>
              <span class="method-badge" :class="methodClass(entry.method)">{{ entry.method }}</span>
            </td>
            <td>
              <span v-if="entry.status" class="status-code" :class="statusClass(entry.status)">{{ entry.status }}</span>
              <span v-else-if="entry.endTime" class="status-code status-err">ERR</span>
              <span v-else class="pending-dot"></span>
            </td>
            <td class="hist-url text-left">{{ entry.url }}</td>
            <td class="hist-source">{{ pluginLabel(entry.source) }}</td>
            <td class="text-center hist-latency">{{ displayDuration(entry) }}</td>
            <td class="text-center hist-size">
              <size-pair :bytes-in="entry.bytesIn || 0" :bytes-out="entry.bytesOut || 0"/>
            </td>
            <td class="text-center hist-time">{{ formatTime(entry.startTime) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!filtered.length" class="hist-empty">
        <span v-if="history.length">没有匹配的请求</span>
        <span v-else>暂无请求记录</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useContext, useMenu, useRpc } from '@cordisjs/client'
import type {} from '@cordisjs/plugin-loader-webui/client'
import SizePair from './size-pair.vue'
import type { Data, HistoryEntry } from '../src'

const ctx = useContext()
const data = useRpc<Data>()
const history = computed<HistoryEntry[]>(() => data.value?.history ?? [])
const triggerHistoryMenu = useMenu('httpHistory')

// live "now" for ticking duration of pending requests
const now = ref(Date.now())
let tickHandle: number | undefined
onMounted(() => {
  tickHandle = window.setInterval(() => now.value = Date.now(), 500)
})
onBeforeUnmount(() => {
  if (tickHandle) clearInterval(tickHandle)
})

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

function pluginLabel(source?: string) {
  if (!source) return 'unknown'
  const manager = ctx.get('manager')
  if (!manager) return source
  const prefix = manager.prefix
  const local = prefix && source.startsWith(prefix) ? source.slice(prefix.length) : source
  const entry = manager.plugins.value.entries[local]
  if (!entry) return source
  return manager.getLabel(entry)
}

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

function formatDuration(ms: number) {
  if (ms < 1000) return ms + 'ms'
  return (ms / 1000).toFixed(1) + 's'
}

function displayDuration(entry: HistoryEntry) {
  const ms = entry.endTime ? entry.endTime - entry.startTime : Math.max(0, now.value - entry.startTime)
  return formatDuration(ms)
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toTimeString().slice(0, 8)
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

.history-list {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}

.hist-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
}

.hist-table tr {
  border: none;
}

.hist-table col.col-method  { width: 80px; }
.hist-table col.col-status  { width: 80px; }
.hist-table col.col-url     { width: auto; }
.hist-table col.col-plugin  { width: 160px; }
.hist-table col.col-latency { width: 80px; }
.hist-table col.col-size    { width: 140px; }
.hist-table col.col-time    { width: 96px; }

.hist-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  text-align: center;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-secondary);
  white-space: nowrap;
}

.hist-table tbody td {
  padding: 10px 12px;
  vertical-align: middle;
  border-bottom: 1px solid var(--border-primary);
  white-space: nowrap;
}

// only truncate for flexible text columns; fixed-width badges must not be clipped
.hist-table tbody td.hist-url,
.hist-table tbody td.hist-source {
  overflow: hidden;
  text-overflow: ellipsis;
}

.hist-row {
  transition: background 0.1s;
  cursor: pointer;

  &:hover td {
    background: var(--bg-hover);
  }

  &.active td {
    background: var(--accent-muted);
  }
}

.method-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  padding: 2px 0;
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
  align-items: center;
  justify-content: center;
  width: 52px;
  padding: 2px 0;
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

.pending-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse 1s ease-in-out infinite;
}

.hist-row.pending .hist-latency {
  color: var(--accent);
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.85); }
  50%      { opacity: 1;   transform: scale(1); }
}

.hist-url {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-primary);
}

.hist-source {
  font-size: 12px;
  color: var(--text-tertiary);
}

.hist-latency { font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary); }
.hist-size { font-size: 12px; }
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
