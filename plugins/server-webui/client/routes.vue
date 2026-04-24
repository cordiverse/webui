<template>
  <div class="server-routes">
    <div class="route-stats">
      <div class="stat-card">
        <div class="stat-label">Total Routes</div>
        <div class="stat-value">{{ stats.totalRoutes }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Requests (1h)</div>
        <div class="stat-value">{{ formatCount(stats.requestsLastHour) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Latency</div>
        <div class="stat-value">{{ stats.avgLatency }}ms</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Error Rate</div>
        <div class="stat-value">{{ formatRate(stats.errorRate) }}</div>
      </div>
    </div>

    <div class="route-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th class="col-method">Method</th>
            <th>Path</th>
            <th class="col-plugin">Plugin</th>
            <th class="col-count">Requests</th>
            <th class="col-avg">Avg</th>
            <th class="col-status">Last Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="route of routes" :key="route.id">
            <td><span class="method-badge" :class="methodClass(route.method)">{{ route.method }}</span></td>
            <td><span class="route-path">{{ route.path }}</span></td>
            <td><span class="route-plugin">{{ route.plugin || '—' }}</span></td>
            <td>{{ route.requests }}</td>
            <td><span class="latency">{{ route.requests ? route.avgLatency + 'ms' : '—' }}</span></td>
            <td>
              <span v-if="route.lastStatus" class="status-code" :class="statusClass(route.lastStatus)">
                {{ route.lastStatus }}
              </span>
              <span v-else>—</span>
            </td>
          </tr>
          <tr v-if="!routes.length">
            <td colspan="6" class="empty">暂无路由注册</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import { useRpc } from '@cordisjs/client'
import type { Data } from '../src'

const data = useRpc<Data>()

const routes = computed(() => data.value?.routes ?? [])
const stats = computed(() => data.value?.stats ?? {
  totalRoutes: 0,
  requestsLastHour: 0,
  avgLatency: 0,
  errorRate: 0,
})

function methodClass(method: string) {
  const m = method.toLowerCase()
  if (m === 'ws') return 'method-ws'
  if (['get', 'post', 'put', 'delete', 'patch'].includes(m)) return 'method-' + m
  return 'method-other'
}

function statusClass(status: number) {
  if (!status) return 'status-err'
  return 'status-' + Math.floor(status / 100) + 'xx'
}

function formatCount(n: number) {
  if (n < 1000) return String(n)
  return (n / 1000).toFixed(1) + 'k'
}

function formatRate(r: number) {
  if (!r) return '0%'
  const pct = r * 100
  return pct < 10 ? pct.toFixed(1) + '%' : Math.round(pct) + '%'
}

</script>

<style lang="scss" scoped>

.server-routes {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.route-stats {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  padding: 20px 24px;
}

.stat-card {
  padding: 14px 16px;

  .stat-label {
    margin-bottom: 4px;
  }

  .stat-value {
    font-size: 22px;
  }
}

.route-table-wrap {
  flex: 1 1 0;
  overflow-y: auto;
  padding: 0 24px 24px;
}

.col-method  { width: 80px; }
.col-plugin  { width: 160px; }
.col-count   { width: 100px; }
.col-avg     { width: 80px; }
.col-status  { width: 100px; }

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

.route-path {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-primary);
}

.route-plugin {
  font-size: 12px;
  color: var(--text-tertiary);
}

.latency {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-secondary);
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
  text-align: center;
  color: var(--text-tertiary);
  padding: 32px;
}

</style>
