<template>
  <div class="request-root">
    <div class="panel-header">
      <div class="panel-tabs">
        <span
          v-for="t of leftTabs"
          :key="t.id"
          class="panel-tab"
          :class="{ active: leftTab === t.id }"
          @click="leftTab = t.id"
        >{{ t.label }}</span>
      </div>
    </div>

    <kv-table
      v-if="leftTab === 'headers'"
      :rows="state.headers"
      key-placeholder="Header Key"
      value-placeholder="Header Value"
    />
    <kv-table
      v-else-if="leftTab === 'query'"
      :rows="state.query"
      key-placeholder="Param Key"
      value-placeholder="Param Value"
    />
    <template v-else>
      <div class="body-type-bar">
        <el-select v-model="state.bodyType" size="small">
          <el-option v-for="opt of bodyTypeOptions" :key="opt.id" :value="opt.id" :label="opt.label"/>
        </el-select>
      </div>

      <textarea
        v-if="state.bodyType === 'json' || state.bodyType === 'xml'"
        class="body-input"
        v-model="state.body"
        :placeholder="state.bodyType === 'json' ? '{\n  \&quot;key\&quot;: \&quot;value\&quot;\n}' : '<root></root>'"
        spellcheck="false"
      ></textarea>
      <kv-table
        v-else-if="state.bodyType === 'formdata' || state.bodyType === 'urlencoded'"
        :rows="state.formBody"
        key-placeholder="Field Key"
        value-placeholder="Field Value"
      />
      <event-stream
        v-else-if="state.bodyType === 'eventstream'"
        :events="state.events"
      />
      <div v-else class="body-empty">No body.</div>
    </template>
  </div>
</template>

<script lang="ts" setup>

import { ref } from 'vue'
import KvTable from './kv-table.vue'
import EventStream from './event-stream.vue'
import type { BodyType, TabState } from './types'

defineProps<{
  state: TabState
}>()

const leftTabs = [
  { id: 'headers', label: 'Headers' },
  { id: 'body', label: 'Body' },
  { id: 'query', label: 'Query' },
] as const

const bodyTypeOptions: { id: BodyType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'json', label: 'JSON' },
  { id: 'xml', label: 'XML' },
  { id: 'formdata', label: 'FormData' },
  { id: 'urlencoded', label: 'URLSearchParams' },
  { id: 'eventstream', label: 'EventStream' },
]

const leftTab = ref<'headers' | 'body' | 'query'>('headers')

</script>

<style lang="scss" scoped>

.request-root {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.panel-header {
  flex: 0 0 auto;
  display: flex;
  align-items: stretch;
  gap: 8px;
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

.body-type-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-secondary);
}

.body-empty {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-sans);
  color: var(--text-tertiary);
  font-size: 13px;
}

.body-input {
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
  background: var(--bg-tertiary);
  border: none;
  border-radius: 0;
  padding: 12px 16px;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-primary);
  outline: none;
  resize: none;
  box-sizing: border-box;
}

</style>
