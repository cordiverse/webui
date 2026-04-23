<template>
  <div class="sse-editor">
    <div class="sse-list">
      <sse-events-table :events="events" removable @remove="onRemove"/>
    </div>
    <div class="sse-input-bar">
      <div class="sse-input-row">
        <input
          class="sse-input sse-event-name"
          v-model="eventName"
          placeholder="Event (optional)"
        />
        <input
          class="sse-input sse-id"
          v-model="idInput"
          placeholder="ID (optional)"
        />
        <input
          class="sse-input sse-retry"
          v-model.number="retryInput"
          type="number"
          min="0"
          placeholder="Retry ms"
        />
      </div>
      <div class="sse-input-row">
        <textarea
          class="sse-input sse-data"
          v-model="dataInput"
          placeholder="Data (supports multiple lines)"
          spellcheck="false"
          rows="3"
          @keydown="onDataKey"
        ></textarea>
        <button class="sse-add" :disabled="!canAdd" @click="addEvent">
          添加事件
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>

import { computed, ref } from 'vue'
import SseEventsTable from './sse-events-table.vue'
import type { SseEvent } from './types'

const props = defineProps<{
  events: SseEvent[]
}>()

const eventName = ref('')
const idInput = ref('')
const retryInput = ref<number | ''>('')
const dataInput = ref('')

const canAdd = computed(() => {
  return !!(dataInput.value || eventName.value || idInput.value || retryInput.value !== '')
})

function addEvent() {
  if (!canAdd.value) return
  const ev: SseEvent = {
    event: eventName.value || undefined,
    id: idInput.value || undefined,
    retry: typeof retryInput.value === 'number' ? retryInput.value : undefined,
    data: dataInput.value,
    ts: 0,
  }
  props.events.push(ev)
  dataInput.value = ''
  idInput.value = ''
  retryInput.value = ''
  // keep eventName sticky for subsequent events
}

function onRemove(index: number) {
  props.events.splice(index, 1)
}

function onDataKey(e: KeyboardEvent) {
  // Ctrl/Cmd + Enter submits; Enter alone inserts newline (native textarea behavior)
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    addEvent()
  }
}

</script>

<style lang="scss" scoped>

.sse-editor {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sse-list {
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
}

.sse-input-bar {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--border-primary);
  background: var(--bg-secondary);
}

.sse-input-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.sse-input {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  padding: 0 8px;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-primary);
  outline: none;
  min-width: 0;

  &:focus {
    border-color: var(--border-focus);
  }
}

input.sse-input { height: 28px; }

.sse-event-name { flex: 2 1 0; }
.sse-id         { flex: 2 1 0; }
.sse-retry      { flex: 1 1 0; }

.sse-data {
  flex: 1 1 auto;
  min-height: 60px;
  padding: 6px 8px;
  resize: vertical;
  line-height: 1.5;
  font-family: var(--font-mono);
}

.sse-add {
  height: 28px;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  flex: 0 0 auto;
  align-self: flex-start;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background: var(--bg-hover);
  }
}

</style>
