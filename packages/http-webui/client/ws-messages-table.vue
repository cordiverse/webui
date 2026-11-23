<template>
  <div class="ws-messages">
    <div class="k-table-head">
      <table class="ws-table">
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
      <table class="ws-table">
        <k-colgroup :columns="columns"/>
        <tbody>
          <tr v-for="(msg, i) of messages" :key="i">
            <td class="k-table-filler"></td>
            <td class="text-center ws-dir" :class="msg.direction">
              <span :title="msg.direction === 'out' ? '发送' : '接收'">
                {{ msg.direction === 'out' ? '↑' : '↓' }}
              </span>
            </td>
            <td class="text-left ws-data">{{ msg.data }}</td>
            <td class="text-right ws-size">{{ formatSize(msg.size) }}</td>
            <td class="text-left ws-time">{{ msg.ts ? formatTime(msg.ts) : '待发送' }}</td>
            <td v-if="editable" class="text-center ws-actions">
              <template v-if="msg.direction === 'out'">
                <button
                  class="ws-icon-btn persist-btn"
                  :class="{ active: msg.persist }"
                  :title="msg.persist ? '已持久化 (点击取消)' : '持久化 (保存到 localStorage)'"
                  @click.stop="$emit('toggle-persist', i)"
                >
                  <svg v-if="msg.persist" viewBox="0 0 16 16" width="12" height="12">
                    <path fill="currentColor" d="M4 2h8v12l-4-2.5L4 14z"/>
                  </svg>
                  <svg v-else viewBox="0 0 16 16" width="12" height="12">
                    <path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" d="M4.5 2.5h7v11l-3.5-2.2-3.5 2.2z"/>
                  </svg>
                </button>
                <button class="ws-icon-btn" title="删除" @click.stop="$emit('remove', i)">×</button>
              </template>
            </td>
            <td class="k-table-filler"></td>
          </tr>
          <tr v-if="!messages.length" class="ws-empty">
            <td :colspan="colspan">暂无消息</td>
          </tr>
        </tbody>
      </table>
    </el-scrollbar>
  </div>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import type { TableColumn } from '@cordisjs/client'
import { formatSize } from './utils'
import type { WsMessage } from './types'

const props = defineProps<{
  messages: WsMessage[]
  editable?: boolean
}>()

defineEmits<{
  (e: 'remove', index: number): void
  (e: 'toggle-persist', index: number): void
}>()

const columns = computed<TableColumn[]>(() => [
  { label: '', align: 'center', width: 40 },
  { label: 'Data', align: 'left', maxWidth: 800 },
  { label: 'Size', align: 'right', width: 72 },
  { label: 'Time', align: 'left', width: 110 },
  ...props.editable ? [{ label: '', align: 'center', width: 68 } as const] : [],
])

// a filler column precedes and follows the declared columns
const colspan = computed(() => columns.value.length + 2)

function formatTime(ts: number) {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

</script>

<style lang="scss" scoped>

.ws-messages {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ws-table {
  font-size: 12px;
  font-family: var(--font-mono);
}

.ws-table thead th {
  padding: 6px 10px;
  font-size: 10px;
  color: var(--text-tertiary);
  text-transform: uppercase;
}

.ws-table tbody td {
  padding: 6px 10px;
  vertical-align: top;
}

.ws-dir {
  font-weight: 700;

  &.out { color: var(--accent); }
  &.in  { color: var(--success); }
}

.ws-data {
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-primary);
}

.ws-size {
  font-size: 11px;
  color: var(--text-tertiary);
}

.ws-time {
  font-size: 11px;
  color: var(--text-tertiary);
}

.ws-actions {
  padding: 4px !important;
}

.ws-icon-btn {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  font-size: 14px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.active {
    color: var(--accent);
  }
}

.ws-empty td {
  text-align: center;
  color: var(--text-tertiary);
  padding: 24px;
}

</style>
