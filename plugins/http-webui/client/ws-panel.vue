<template>
  <div class="ws-panel">
    <div class="ws-panel-header">
      <div class="panel-tabs">
        <span
          class="panel-tab"
          :class="{ active: tab === 'messages' }"
          @click="tab = 'messages'"
        >Messages</span>
        <span
          class="panel-tab"
          :class="{ active: tab === 'query' }"
          @click="tab = 'query'"
        >Query</span>
      </div>
      <div class="ws-meta" v-if="tab === 'messages'">
        <span class="status-code" :class="statusClass">{{ statusLabel }}</span>
        <size-pair :bytes-in="recvBytes" :bytes-out="sentBytes"/>
        <span>{{ messages.length }} message{{ messages.length > 1 ? 's' : '' }}</span>
      </div>
    </div>

    <kv-table
      v-if="tab === 'query'"
      :rows="query"
      key-placeholder="Param Key"
      value-placeholder="Param Value"
    />

    <div v-else class="ws-scroll-area">
      <div class="ws-timeline">
        <ws-messages-table
          v-if="messages.length"
          :messages="messages"
          editable
          @remove="onRemove"
          @toggle-persist="onTogglePersist"
        />
        <div v-if="showEmptyState" class="ws-empty-state">{{ emptyLabel }}</div>
      </div>

      <div class="ws-composer">
        <button
          class="ws-icon-btn persist-btn"
          :class="{ active: persist }"
          :title="persist ? '已标记为持久化 (点击取消)' : '持久化：保存到 localStorage，重新加载后重新排队发送'"
          @click="persist = !persist"
        >
          <svg v-if="persist" viewBox="0 0 16 16" width="14" height="14">
            <path fill="currentColor" d="M4 2h8v12l-4-2.5L4 14z"/>
          </svg>
          <svg v-else viewBox="0 0 16 16" width="14" height="14">
            <path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" d="M4.5 2.5h7v11l-3.5-2.2-3.5 2.2z"/>
          </svg>
        </button>
        <textarea
          ref="dataEl"
          class="ws-input"
          v-model="dataInput"
          placeholder="Message body"
          spellcheck="false"
          rows="1"
          @input="autoResize"
          @keydown="onKey"
        ></textarea>
        <button
          class="ws-send"
          :disabled="!dataInput"
          :title="canSend ? '发送 (Ctrl+Enter)' : '未连接，将加入队列并在连接后自动发送'"
          @click="submit"
        >
          {{ canSend ? '发送' : '入队' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>

import { computed, nextTick, onMounted, ref, watch } from 'vue'
import WsMessagesTable from './ws-messages-table.vue'
import KvTable from './kv-table.vue'
import SizePair from './size-pair.vue'
import type { KvRow, WsMessage } from './types'

const props = defineProps<{
  messages: WsMessage[]
  query: KvRow[]
  canSend: boolean
  wsStatus: 'idle' | 'connecting' | 'open' | 'closed' | 'error'
}>()

const emit = defineEmits<{
  (e: 'send', data: string, persist: boolean): void
  (e: 'queue', data: string, persist: boolean): void
}>()

const dataInput = ref('')
const persist = ref(false)
const dataEl = ref<HTMLTextAreaElement>()
const tab = ref<'messages' | 'query'>('messages')

const MAX_ROWS = 10

const sentBytes = computed(() => {
  let n = 0
  for (const m of props.messages) if (m.direction === 'out' && m.ts) n += m.size
  return n
})

const recvBytes = computed(() => {
  let n = 0
  for (const m of props.messages) if (m.direction === 'in') n += m.size
  return n
})

const statusLabel = computed(() => {
  switch (props.wsStatus) {
    case 'connecting': return 'Connecting'
    case 'open': return 'Open'
    case 'closed': return 'Closed'
    case 'error': return 'Error'
    default: return 'Idle'
  }
})

const emptyLabel = computed(() => {
  switch (props.wsStatus) {
    case 'closed': return 'Closed'
    case 'error': return 'Connection error'
    default: return 'Idle'
  }
})

const showEmptyState = computed(() => {
  return props.wsStatus === 'idle' || props.wsStatus === 'closed' || props.wsStatus === 'error'
})

const statusClass = computed(() => {
  switch (props.wsStatus) {
    case 'open': return 'status-2xx'
    case 'connecting': return 'status-3xx'
    case 'closed': return 'status-4xx'
    case 'error': return 'status-err'
    default: return 'status-idle'
  }
})

function autoResize() {
  const el = dataEl.value
  if (!el) return
  el.style.height = 'auto'
  const cs = getComputedStyle(el)
  const lineHeight = parseFloat(cs.lineHeight) || 18
  const paddingY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
  const borderY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
  const max = lineHeight * MAX_ROWS + paddingY + borderY
  el.style.height = Math.min(el.scrollHeight + borderY, max) + 'px'
}

onMounted(autoResize)
watch(dataInput, () => nextTick(autoResize))

function submit() {
  if (!dataInput.value) return
  const data = dataInput.value
  if (props.canSend) {
    emit('send', data, persist.value)
  } else {
    emit('queue', data, persist.value)
  }
  dataInput.value = ''
  persist.value = false
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    submit()
  }
}

function onRemove(index: number) {
  props.messages.splice(index, 1)
}

function onTogglePersist(index: number) {
  const msg = props.messages[index]
  if (msg.direction !== 'out') return
  msg.persist = !msg.persist
}

</script>

<style lang="scss" scoped>

.ws-panel {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ws-panel-header {
  flex: 0 0 auto;
  display: flex;
  align-items: stretch;
  gap: 12px;
  padding: 0 16px;
  height: 36px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-secondary);
}

.panel-tabs {
  display: flex;
  align-items: stretch;
  margin-bottom: -1px;
}

.panel-tab {
  display: flex;
  align-items: center;
  padding: 0 14px;
  font-size: 13px;
  color: var(--text-tertiary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  font-weight: 500;
  transition: var(--color-transition);
  box-sizing: border-box;
  white-space: nowrap;

  &.active {
    color: var(--text-primary);
    border-bottom-color: var(--accent);
  }

  &:hover:not(.active) {
    color: var(--text-secondary);
  }
}

.status-code {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-mono);
  flex-shrink: 0;

  &.status-2xx { background: var(--success-muted); color: var(--success); }
  &.status-3xx { background: var(--accent-muted);  color: var(--accent); }
  &.status-4xx { background: var(--warning-muted); color: var(--warning); }
  &.status-err { background: var(--error-muted);   color: var(--error); }
  &.status-idle { background: var(--bg-hover);     color: var(--text-tertiary); }
}

.ws-meta {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-tertiary);
}

.ws-scroll-area {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: var(--bg-tertiary);
}

.ws-timeline {
  flex: 1 1 auto;
  min-height: 240px;
  display: flex;
  flex-direction: column;
}

.ws-empty-state {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 13px;
  font-family: var(--font-sans);
  user-select: none;
  padding: 16px;
}

.ws-composer {
  flex: 0 0 auto;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 10px 16px;
  border-top: 1px solid var(--border-primary);
  background: var(--bg-secondary);
}

.ws-icon-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-primary);
  background: var(--bg-tertiary);
  color: var(--text-tertiary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  align-self: flex-start;
  transition: var(--color-transition);

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  &.active {
    color: var(--accent);
    background: var(--accent-muted);
    border-color: transparent;
  }
}

.ws-input {
  flex: 1 1 auto;
  box-sizing: border-box;
  min-height: 28px;
  min-width: 0;
  padding: 4px 8px;
  resize: none;
  line-height: 1.5;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  outline: none;
  overflow-y: auto;

  &:focus {
    border-color: var(--border-focus);
  }
}

.ws-send {
  height: 28px;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: white;
  cursor: pointer;
  flex: 0 0 auto;
  align-self: flex-start;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  &:hover:not(:disabled) {
    background: var(--accent-hover);
  }
}

</style>
