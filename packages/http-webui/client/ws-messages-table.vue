<template>
  <table class="ws-table">
    <colgroup>
      <col class="col-dir"/>
      <col class="col-data"/>
      <col class="col-size"/>
      <col class="col-time"/>
      <col v-if="editable" class="col-actions"/>
    </colgroup>
    <thead>
      <tr>
        <th class="text-center"></th>
        <th class="text-left">Data</th>
        <th class="text-right">Size</th>
        <th class="text-left">Time</th>
        <th v-if="editable"></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(msg, i) of messages" :key="i">
        <td class="text-center ws-dir" :class="msg.direction">
          <span :title="msg.direction === 'out' ? '发送' : '接收'">
            {{ msg.direction === 'out' ? '↑' : '↓' }}
          </span>
        </td>
        <td class="text-left ws-data">{{ msg.data }}</td>
        <td class="text-right ws-size">{{ formatSize(msg.size) }}</td>
        <td class="text-left ws-time">{{ msg.ts ? formatTime(msg.ts) : '待发送' }}</td>
        <td v-if="editable" class="ws-actions">
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
      </tr>
      <tr v-if="!messages.length" class="ws-empty">
        <td :colspan="colspan">暂无消息</td>
      </tr>
    </tbody>
  </table>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
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

const colspan = computed(() => 4 + (props.editable ? 1 : 0))

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

.ws-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
  font-family: var(--font-mono);
}

.ws-table tr {
  border: none;
}

.ws-table col.col-dir     { width: 40px; }
.ws-table col.col-data    { width: auto; }
.ws-table col.col-size    { width: 72px; }
.ws-table col.col-time    { width: 110px; }
.ws-table col.col-actions { width: 68px; }

.ws-table thead th {
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
}

.ws-table tbody td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-primary);
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
  white-space: nowrap;
}

.ws-time {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.ws-actions {
  padding: 4px !important;
  text-align: center;
  white-space: nowrap;
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
