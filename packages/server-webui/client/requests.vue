<template>
  <k-layout>
    <template #header>
      <span class="crumb">Requests</span>
      <span class="crumb-sub" v-if="data">
        {{ data.requests.length }} / {{ data.requestLimit }} requests
      </span>
    </template>

    <template #menu>
      <span class="menu-item" @click="clearRequests" title="Clear">
        <k-icon class="menu-icon" name="trash"/>
      </span>
    </template>

    <div class="requests-body">
      <div class="req-toolbar">
        <div class="method-filter">
          <button
            v-for="m of methodOptions"
            :key="m.id"
            class="method-btn"
            :class="{ active: activeMethod === m.id }"
            @click="activeMethod = m.id"
          >{{ m.label }}</button>
        </div>

        <select class="source-filter" v-model="activeStatus">
          <option value="">All Status</option>
          <option value="2xx">2xx</option>
          <option value="3xx">3xx</option>
          <option value="4xx">4xx</option>
          <option value="5xx">5xx</option>
        </select>

        <div class="live-indicator">
          <div class="live-dot"></div>
          Live
        </div>

        <div style="flex: 1"></div>

        <div class="search-wrapper">
          <k-icon name="search"/>
          <input class="search-input" v-model="searchInput" placeholder="Filter by path..."/>
        </div>
      </div>

      <table class="req-table">
        <colgroup>
          <col class="col-method"/>
          <col class="col-status"/>
          <col class="col-path"/>
          <col class="col-remote"/>
          <col class="col-latency"/>
          <col class="col-size"/>
          <col class="col-time"/>
        </colgroup>
        <thead>
          <tr>
            <th>Method</th>
            <th>Status</th>
            <th class="text-left">Path</th>
            <th class="text-left">Client</th>
            <th class="text-center">Duration</th>
            <th class="text-center">Size</th>
            <th class="text-center">Time</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="req of filtered" :key="req.id" :class="{ pending: !req.endTime }">
            <td>
              <span class="method-badge" :class="methodClass(req.method)">{{ req.method }}</span>
            </td>
            <td>
              <span v-if="!req.endTime && !req.status" class="pending-dot"></span>
              <span v-else class="status-code" :class="statusClass(req.status)">{{ req.status || 'ERR' }}</span>
            </td>
            <td class="cell-path text-left">{{ req.path }}</td>
            <td class="cell-remote text-left">{{ req.remote || '—' }}</td>
            <td class="text-center">{{ displayDuration(req) }}</td>
            <td class="text-center">
              <size-pair :bytes-in="req.bytesIn || 0" :bytes-out="req.bytesOut || 0"/>
            </td>
            <td class="text-center">{{ formatTime(req.startTime) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!filtered.length" class="empty">
        <span v-if="requests.length">没有匹配的请求</span>
        <span v-else>暂无请求记录</span>
      </div>
    </div>
  </k-layout>
</template>

<script lang="ts" setup>

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRpc } from '@cordisjs/client'
import SizePair from './size-pair.vue'
import type { Data, ServerRequest } from '../src'
import { formatDuration, formatTime, methodClass, statusClass } from './utils'

const data = useRpc<Data>()
const requests = computed(() => data.value?.requests ?? [])

// Live "now" for ticking duration of pending WS connections
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
  { id: 'WS', label: 'WS' },
]

const activeMethod = ref('')
const activeStatus = ref('')
const searchInput = ref('')

const filtered = computed(() => {
  return [...requests.value].reverse().filter((req) => {
    if (activeMethod.value && req.method !== activeMethod.value) return false
    if (activeStatus.value) {
      const bucket = Math.floor(req.status / 100) + 'xx'
      if (bucket !== activeStatus.value) return false
    }
    if (searchInput.value && !req.path.toLowerCase().includes(searchInput.value.toLowerCase())) return false
    return true
  })
})

function displayDuration(req: ServerRequest) {
  const ms = req.endTime ? req.endTime - req.startTime : Math.max(0, now.value - req.startTime)
  return formatDuration(ms)
}

function clearRequests() {
  data.value?.clear()
}

</script>

<style lang="scss" scoped>

.requests-body {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.req-toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border-secondary);
}

.method-filter {
  display: flex;
  gap: 4px;
}

.method-btn {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border: none;
  cursor: pointer;
  transition: var(--color-transition);

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.active {
    background: var(--accent);
    color: white;
  }
}

.source-filter {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
}

.live-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-tertiary);

  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--success);
    animation: pulse 2s ease-in-out infinite;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.search-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);

  .search-input {
    border: none;
    background: transparent;
    outline: none;
    font-size: 12px;
    color: var(--text-primary);
    width: 200px;

    &::placeholder {
      color: var(--text-tertiary);
    }
  }
}

.req-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th, td {
    text-align: left;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-secondary);
    vertical-align: middle;
  }

  th {
    color: var(--text-tertiary);
    font-weight: 500;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: var(--bg-secondary);
    position: sticky;
    top: 0;
    z-index: 1;
    border-bottom: 1px solid var(--border-primary);
  }

  .col-method  { width: 80px; }
  .col-status  { width: 80px; }
  .col-remote  { width: 140px; }
  .col-latency { width: 100px; }
  .col-size    { width: 140px; }
  .col-time    { width: 96px; }

  .text-left { text-align: left; }
  .text-center { text-align: center; }

  .cell-path {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-primary);
  }

  .cell-remote {
    font-size: 12px;
    color: var(--text-tertiary);
  }
}

.method-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 700;
  font-family: var(--font-mono);
  min-width: 50px;

  &.method-get    { background: var(--accent-muted);  color: var(--accent); }
  &.method-post   { background: var(--success-muted); color: var(--success); }
  &.method-put    { background: var(--warning-muted); color: var(--warning); }
  &.method-delete { background: var(--error-muted);   color: var(--error); }
  &.method-patch  { background: var(--warning-muted); color: var(--warning); }
  &.method-ws     { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
  &.method-other  { background: var(--bg-hover); color: var(--text-secondary); }
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

tr.pending td {
  background: rgba(168, 85, 247, 0.04);
}

.pending-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  animation: pending-pulse 1s ease-in-out infinite;
}

@keyframes pending-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.85); }
  50%      { opacity: 1;   transform: scale(1); }
}

.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

</style>
