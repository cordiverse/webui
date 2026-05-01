<template>
  <k-layout>
    <template #header>
      <span class="crumb">Routes</span>
      <span class="crumb-sub" v-if="data">
        {{ routes.length }} routes · {{ stats.requestsLastHour }} req/h
      </span>
    </template>

    <div class="routes-body">
      <div class="stat-row">
        <div class="stat-card">
          <div class="stat-value">{{ routes.length }}</div>
          <div class="stat-label">Total Routes</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats.requestsLastHour }}</div>
          <div class="stat-label">Requests (1h)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ formatDuration(stats.avgLatency) }}</div>
          <div class="stat-label">Avg Latency</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ (stats.errorRate * 100).toFixed(1) }}%</div>
          <div class="stat-label">Error Rate</div>
        </div>
      </div>

      <table class="route-table">
        <colgroup>
          <col class="col-method"/>
          <col class="col-path"/>
          <col class="col-plugin"/>
          <col class="col-requests"/>
          <col class="col-latency"/>
          <col class="col-status"/>
        </colgroup>
        <thead>
          <tr>
            <th>Method</th>
            <th class="text-left">Path</th>
            <th class="text-left">Plugin</th>
            <th class="text-center">Requests</th>
            <th class="text-center">Avg Latency</th>
            <th class="text-center">Last Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="route of routes" :key="route.id">
            <td>
              <span class="method-badge" :class="methodClass(route.method)">{{ route.method }}</span>
            </td>
            <td class="cell-path text-left">{{ fullPath(route) }}</td>
            <td class="cell-plugin text-left">{{ pluginLabel(route.plugin) }}</td>
            <td class="text-center">{{ route.requests || '—' }}</td>
            <td class="text-center">{{ route.requests ? formatDuration(route.avgLatency) : '—' }}</td>
            <td class="text-center">
              <span v-if="route.lastStatus" class="status-code" :class="statusClass(route.lastStatus)">
                {{ route.lastStatus }}
              </span>
              <span v-else>—</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!routes.length" class="empty">暂无已注册的路由</div>
    </div>
  </k-layout>
</template>

<script lang="ts" setup>

import { computed, onUnmounted, ref } from 'vue'
import { useContext, useRpc } from '@cordisjs/client'
import type {} from '@cordisjs/plugin-loader-webui/client'
import type { Data, ServerRoute } from '../src'
import { formatDuration, methodClass, statusClass } from './utils'

const ctx = useContext()
const data = useRpc<Data>()

const routes = computed<ServerRoute[]>(() => Object.values(data.value?.routes ?? {}))

// Sliding-window stats are computed on the client from `requests`, driven by
// a lightweight `now` tick so windows still slide when the server is idle.
const now = ref(Date.now())
const tick = setInterval(() => { now.value = Date.now() }, 30_000)
onUnmounted(() => clearInterval(tick))

const stats = computed(() => {
  const horizon = now.value - 3600_000
  const requests = data.value?.requests ?? []
  let count = 0
  let errors = 0
  let totalLatency = 0
  for (const req of requests) {
    if (req.startTime < horizon) continue
    if (!req.endTime) continue
    count++
    totalLatency += req.endTime - req.startTime
    if (req.status >= 400 || req.status === 0) errors++
  }
  return {
    requestsLastHour: count,
    avgLatency: count ? Math.round(totalLatency / count) : 0,
    errorRate: count ? errors / count : 0,
  }
})

function fullPath(route: ServerRoute) {
  return (route.interceptPath ?? '') + route.path
}

function pluginLabel(source?: string) {
  if (!source) return '—'
  const manager = ctx.get('manager')
  if (!manager) return source
  const prefix = manager.prefix
  const local = prefix && source.startsWith(prefix) ? source.slice(prefix.length) : source
  const entry = manager.plugins.value.entries[local]
  if (!entry) return source
  return manager.getLabel(entry)
}

</script>

<style lang="scss" scoped>

.routes-body {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.stat-row {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  padding: 20px 24px;
}

.stat-card {
  padding: 14px 16px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);

  .stat-value {
    font-size: 22px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 4px;
  }

  .stat-label {
    font-size: 12px;
    color: var(--text-tertiary);
  }
}

.route-table {
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
  .col-plugin  { width: 160px; }
  .col-requests { width: 100px; }
  .col-latency { width: 100px; }
  .col-status  { width: 100px; }

  .text-left { text-align: left; }
  .text-center { text-align: center; }

  .cell-path {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text-primary);
  }

  .cell-plugin {
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

.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

</style>
