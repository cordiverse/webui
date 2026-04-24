<template>
  <div class="server-requests">
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

      <button class="btn-icon" title="Clear" @click="clearRequests">
        <k-icon name="trash"/>
      </button>
    </div>

    <div class="req-header">
      <span class="col-method">Method</span>
      <span class="col-status">Status</span>
      <span class="col-path">Path</span>
      <span class="col-remote">Client</span>
      <span class="col-latency">Latency</span>
      <span class="col-size">Size</span>
      <span class="col-time">Time</span>
    </div>

    <div class="req-list">
      <div v-for="req of filtered" :key="req.id" class="req-row">
        <span class="col-method method-badge" :class="methodClass(req.method)">{{ req.method }}</span>
        <span class="col-status status-code" :class="statusClass(req.status)">{{ req.status || '—' }}</span>
        <span class="col-path req-path">{{ req.path }}</span>
        <span class="col-remote req-remote">{{ req.remote || '—' }}</span>
        <span class="col-latency req-latency">{{ formatLatency(req.latency) }}</span>
        <span class="col-size req-size">{{ formatSize(req.size) }}</span>
        <span class="col-time req-time">{{ formatTime(req.ts) }}</span>
      </div>
      <div v-if="!filtered.length" class="empty">
        <span v-if="requests.length">没有匹配的请求</span>
        <span v-else>暂无请求记录</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>

import { computed, ref } from 'vue'
import { send, useRpc } from '@cordisjs/client'
import type { Data, ServerRequest } from '../src'

const data = useRpc<Data>()
const requests = computed<ServerRequest[]>(() => data.value?.requests ?? [])

const methodOptions = [
  { id: '', label: 'ALL' },
  { id: 'GET', label: 'GET' },
  { id: 'POST', label: 'POST' },
  { id: 'PUT', label: 'PUT' },
  { id: 'DELETE', label: 'DEL' },
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

function methodClass(method: string) {
  const m = method.toLowerCase()
  if (['get', 'post', 'put', 'delete', 'patch'].includes(m)) return 'method-' + m
  return 'method-other'
}

function statusClass(status: number) {
  if (!status) return 'status-err'
  return 'status-' + Math.floor(status / 100) + 'xx'
}

function formatLatency(ms: number) {
  if (!ms) return '—'
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
  return new Date(ts).toTimeString().slice(0, 8)
}

function clearRequests() {
  send('server-webui.clear')
}

</script>

<style lang="scss" scoped>

.server-requests {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.req-toolbar {
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

.live-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--success);
  margin-left: 8px;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
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

.req-header {
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

.req-list {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}

.req-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 24px;
  border-bottom: 1px solid var(--border-primary);
  font-size: 13px;
  transition: background 0.1s;

  &:hover {
    background: var(--bg-hover);
  }
}

.col-method  { min-width: 52px; }
.col-status  { min-width: 40px; }
.col-path    { flex: 1; min-width: 0; }
.col-remote  { min-width: 110px; }
.col-latency { min-width: 60px; text-align: right; }
.col-size    { min-width: 60px; text-align: right; }
.col-time    { min-width: 80px; text-align: right; }

.method-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: 700;
  font-family: var(--font-mono);

  &.method-get    { background: var(--accent-muted);  color: var(--accent); }
  &.method-post   { background: var(--success-muted); color: var(--success); }
  &.method-put    { background: var(--warning-muted); color: var(--warning); }
  &.method-delete { background: var(--error-muted);   color: var(--error); }
  &.method-patch  { background: var(--warning-muted); color: var(--warning); }
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

.req-path {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.req-remote {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-tertiary);
}

.req-latency { font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary); }
.req-size { font-size: 12px; color: var(--text-tertiary); }
.req-time { font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); }

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--text-tertiary);
  font-size: 13px;
}

</style>
