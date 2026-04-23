<template>
  <table class="sse-table">
    <colgroup>
      <col class="col-event"/>
      <col v-if="hasId" class="col-id"/>
      <col v-if="hasRetry" class="col-retry"/>
      <col class="col-data"/>
      <col class="col-time"/>
      <col v-if="removable" class="col-actions"/>
    </colgroup>
    <thead>
      <tr>
        <th class="text-left">Event</th>
        <th v-if="hasId" class="text-left">ID</th>
        <th v-if="hasRetry" class="text-right">Retry</th>
        <th class="text-left">Data</th>
        <th class="text-left">Time</th>
        <th v-if="removable"></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(ev, i) of events" :key="i">
        <td class="text-left sse-event" :title="ev.event || 'message'">{{ ev.event || 'message' }}</td>
        <td v-if="hasId" class="text-left sse-id" :title="ev.id">{{ ev.id ?? '' }}</td>
        <td v-if="hasRetry" class="text-right sse-retry">{{ ev.retry ?? '' }}</td>
        <td class="text-left sse-data">{{ ev.data }}</td>
        <td class="text-left sse-time">{{ formatTime(ev.ts) }}</td>
        <td v-if="removable" class="sse-remove-cell">
          <button class="sse-remove" title="删除" @click.stop="$emit('remove', i)">×</button>
        </td>
      </tr>
      <tr v-if="!events.length" class="sse-empty">
        <td :colspan="colspan">暂无事件</td>
      </tr>
    </tbody>
  </table>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import type { SseEvent } from './types'

const props = defineProps<{
  events: SseEvent[]
  removable?: boolean
}>()

defineEmits<{
  (e: 'remove', index: number): void
}>()

const hasId = computed(() => props.events.some(ev => ev.id !== undefined && ev.id !== ''))
const hasRetry = computed(() => props.events.some(ev => typeof ev.retry === 'number'))

const colspan = computed(() => {
  return 3 + (hasId.value ? 1 : 0) + (hasRetry.value ? 1 : 0) + (props.removable ? 1 : 0)
})

function formatTime(ts: number) {
  if (!ts) return '—'
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

</script>

<style lang="scss" scoped>

.sse-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
  font-family: var(--font-mono);
}

.sse-table tr {
  border: none;
}

.sse-table col.col-event   { width: 80px; }
.sse-table col.col-id      { width: 80px; }
.sse-table col.col-retry   { width: 64px; }
.sse-table col.col-data    { width: auto; }
.sse-table col.col-time    { width: 96px; }
.sse-table col.col-actions { width: 36px; }

.sse-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 6px 10px;
  font-size: 10px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  white-space: nowrap;
  text-align: center;
}

.sse-table tbody td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-primary);
  vertical-align: top;
}

.sse-event,
.sse-id {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sse-event { color: var(--accent); }
.sse-id    { color: var(--text-secondary); }
.sse-retry { color: var(--text-secondary); font-size: 11px; white-space: nowrap; }

.sse-data {
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-primary);
}

.sse-time { font-size: 11px; color: var(--text-tertiary); white-space: nowrap; }

.sse-remove-cell {
  padding: 4px !important;
  text-align: center;
}

.sse-remove {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  font-size: 14px;
  line-height: 1;

  &:hover {
    background: var(--bg-hover);
    color: var(--error);
  }
}

.sse-empty td {
  text-align: center;
  color: var(--text-tertiary);
  padding: 24px;
}

</style>
