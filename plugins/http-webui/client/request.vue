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
      :rows="headers"
      key-placeholder="Header Key"
      value-placeholder="Header Value"
    />
    <kv-table
      v-else-if="leftTab === 'query'"
      :rows="query"
      key-placeholder="Param Key"
      value-placeholder="Param Value"
    />
    <template v-else>
      <div class="body-type-bar">
        <el-select v-model="bodyType" size="small">
          <el-option v-for="opt of bodyTypeOptions" :key="opt.id" :value="opt.id" :label="opt.label"/>
        </el-select>
      </div>

      <textarea
        v-if="bodyType === 'json' || bodyType === 'xml'"
        class="body-input"
        v-model="body"
        :placeholder="bodyType === 'json' ? '{\n  \&quot;key\&quot;: \&quot;value\&quot;\n}' : '<root></root>'"
        spellcheck="false"
      ></textarea>
      <kv-table
        v-else-if="bodyType === 'formdata' || bodyType === 'urlencoded'"
        :rows="formBody"
        key-placeholder="Field Key"
        value-placeholder="Field Value"
      />
      <div v-else class="body-empty">No body.</div>
    </template>
  </div>
</template>

<script lang="ts" setup>

import { reactive, ref } from 'vue'
import KvTable, { type KvRow } from './kv-table.vue'

type BodyType = 'none' | 'json' | 'xml' | 'formdata' | 'urlencoded'

const body = ref('')
const bodyType = ref<BodyType>('none')
const headers = reactive<KvRow[]>([
  { enabled: true, key: '', value: '' },
])
const query = reactive<KvRow[]>([
  { enabled: true, key: '', value: '' },
])
const formBody = reactive<KvRow[]>([
  { enabled: true, key: '', value: '' },
])

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
]

const leftTab = ref<'headers' | 'body' | 'query'>('headers')

function contentTypeFor(type: BodyType): string | undefined {
  switch (type) {
    case 'json': return 'application/json'
    case 'xml': return 'application/xml'
    case 'urlencoded': return 'application/x-www-form-urlencoded'
    default: return undefined
  }
}

function buildBody(): BodyInit | undefined {
  switch (bodyType.value) {
    case 'none':
      return undefined
    case 'json':
    case 'xml':
      return body.value || undefined
    case 'formdata': {
      const fd = new FormData()
      for (const row of formBody) {
        if (row.enabled && row.key) fd.append(row.key, row.value)
      }
      return fd
    }
    case 'urlencoded': {
      const params = new URLSearchParams()
      for (const row of formBody) {
        if (row.enabled && row.key) params.append(row.key, row.value)
      }
      return params
    }
  }
}

export interface BuiltRequest {
  url: string
  init: RequestInit
}

function build(rawUrl: string, method: string): BuiltRequest {
  const target = new URL(rawUrl)
  for (const row of query) {
    if (row.enabled && row.key) target.searchParams.append(row.key, row.value)
  }

  const h = new Headers()
  for (const row of headers) {
    if (row.enabled && row.key) h.append(row.key, row.value)
  }
  const autoCT = contentTypeFor(bodyType.value)
  if (autoCT && !h.has('content-type')) {
    h.set('content-type', autoCT)
  }

  const init: RequestInit = { method, headers: h }
  if (!['GET', 'HEAD'].includes(method)) {
    init.body = buildBody()
  }

  return { url: target.href, init }
}

defineExpose({ build })

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
  height: 40px;
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
