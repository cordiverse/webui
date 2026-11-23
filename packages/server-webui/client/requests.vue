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

      <div class="k-table-head">
        <table class="req-table">
          <k-colgroup :columns="columns"/>
          <thead>
            <tr>
              <th class="k-table-filler"></th>
              <th v-for="col of columns" :key="col.label" :class="'text-' + col.align">{{ col.label }}</th>
              <th class="k-table-filler"></th>
            </tr>
          </thead>
        </table>
      </div>
      <el-scrollbar v-if="filtered.length" class="k-table-body">
        <table class="req-table">
          <k-colgroup :columns="columns"/>
          <tbody>
            <tr v-for="req of filtered" :key="req.id" :class="{ pending: !req.endTime }">
              <td class="k-table-filler"></td>
              <td class="text-center">
                <span class="method-badge" :class="methodClass(req.method)">{{ req.method }}</span>
              </td>
              <td class="text-center">
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
              <td class="k-table-filler"></td>
            </tr>
          </tbody>
        </table>
      </el-scrollbar>
      <div v-else class="empty">
        <span v-if="requests.length">没有匹配的请求</span>
        <span v-else>暂无请求记录</span>
      </div>
    </div>
  </k-layout>
</template>

<script lang="ts" setup>

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { type TableColumn, useRpc } from '@cordisjs/client'
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

const columns: TableColumn[] = [
  { label: 'Method', align: 'center', width: 100 },
  { label: 'Status', align: 'center', width: 90 },
  { label: 'Path', align: 'left', maxWidth: 480 },
  { label: 'Client', align: 'left', width: 140 },
  { label: 'Duration', align: 'center', width: 100 },
  { label: 'Size', align: 'center', width: 140 },
  { label: 'Time', align: 'center', width: 96 },
]

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
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.req-toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border-primary);
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
  font-size: 13px;

  th, td {
    padding: 10px 16px;
    vertical-align: middle;
  }

  th {
    color: var(--text-tertiary);
    font-weight: 500;
    font-size: 11px;
    text-transform: uppercase;
  }

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
