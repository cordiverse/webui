<template>
  <div class="sse-events">
    <div class="k-table-head">
      <table class="sse-table">
        <k-colgroup :columns="columns"/>
        <thead>
          <tr>
            <th class="k-table-filler"></th>
            <th v-for="(col, i) of columns" :key="i" :class="'text-' + col.align">{{ col.label }}</th>
            <th class="k-table-filler"></th>
          </tr>
        </thead>
      </table>
    </div>
    <el-scrollbar class="k-table-body">
      <table class="sse-table">
        <k-colgroup :columns="columns"/>
        <tbody>
          <tr v-for="(ev, i) of events" :key="i">
            <td class="k-table-filler"></td>
            <td class="text-left sse-event" :title="ev.event || 'message'">{{ ev.event || 'message' }}</td>
            <td v-if="hasId" class="text-left sse-id" :title="ev.id">{{ ev.id ?? '' }}</td>
            <td v-if="hasRetry" class="text-right sse-retry">{{ ev.retry ?? '' }}</td>
            <td class="text-left sse-data">{{ ev.data }}</td>
            <td class="text-left sse-time">{{ formatTime(ev.ts) }}</td>
            <td v-if="removable" class="text-center sse-remove-cell">
              <button class="sse-remove" title="删除" @click.stop="$emit('remove', i)">×</button>
            </td>
            <td class="k-table-filler"></td>
          </tr>
          <tr v-if="!events.length" class="sse-empty">
            <td :colspan="colspan">暂无事件</td>
          </tr>
        </tbody>
      </table>
    </el-scrollbar>
  </div>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import type { TableColumn } from '@cordisjs/client'
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

const columns = computed<TableColumn[]>(() => [
  { label: 'Event', align: 'left', width: 80 },
  ...hasId.value ? [{ label: 'ID', align: 'left', width: 80 } as const] : [],
  ...hasRetry.value ? [{ label: 'Retry', align: 'right', width: 64 } as const] : [],
  { label: 'Data', align: 'left', maxWidth: 800 },
  { label: 'Time', align: 'left', width: 96 },
  ...props.removable ? [{ label: '', align: 'center', width: 36 } as const] : [],
])

// a filler column precedes and follows the declared columns
const colspan = computed(() => columns.value.length + 2)

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

.sse-events {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sse-table {
  font-size: 12px;
  font-family: var(--font-mono);
}

.sse-table thead th {
  padding: 6px 10px;
  font-size: 10px;
  color: var(--text-tertiary);
  text-transform: uppercase;
}

.sse-table tbody td {
  padding: 6px 10px;
  vertical-align: top;
}

.sse-event { color: var(--accent); }
.sse-id    { color: var(--text-secondary); }
.sse-retry { color: var(--text-secondary); font-size: 11px; }

.sse-data {
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-primary);
}

.sse-time { font-size: 11px; color: var(--text-tertiary); }

.sse-remove-cell {
  padding: 4px !important;
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
