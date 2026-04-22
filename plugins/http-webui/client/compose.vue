<template>
  <div class="http-compose">
    <div class="compose-url-bar">
      <select class="method-select" v-model="method">
        <option v-for="m of methods" :key="m" :value="m">{{ m }}</option>
      </select>
      <input class="url-input" v-model="url" placeholder="https://..." @keyup.enter="sendRequest"/>
      <button class="btn btn-primary" :disabled="sending || !url" @click="sendRequest">
        {{ sending ? 'Sending...' : 'Send' }}
      </button>
    </div>

    <div class="compose-body">
      <div class="compose-left">
        <div class="panel-header">
          <div class="panel-tabs">
            <span
              v-for="t of leftTabs"
              :key="t.id"
              class="panel-tab"
              :class="{ active: leftTab === t.id }"
              @click="leftTab = t.id as any"
            >{{ t.label }}</span>
          </div>
        </div>

        <div class="panel-content">
          <template v-if="leftTab === 'headers'">
            <div v-for="(row, index) of headers" :key="index" class="kv-row">
              <input type="checkbox" class="kv-checkbox" v-model="row.enabled"/>
              <input class="kv-input kv-key" v-model="row.key" placeholder="Header"/>
              <input class="kv-input" v-model="row.value" placeholder="Value"/>
              <button class="btn-icon-sm" @click="headers.splice(index, 1)">
                <k-icon name="trash"/>
              </button>
            </div>
            <button class="btn btn-ghost btn-add" @click="headers.push({ enabled: true, key: '', value: '' })">
              <k-icon name="add"/> Add Header
            </button>
          </template>

          <template v-else-if="leftTab === 'query'">
            <div v-for="(row, index) of query" :key="index" class="kv-row">
              <input type="checkbox" class="kv-checkbox" v-model="row.enabled"/>
              <input class="kv-input kv-key" v-model="row.key" placeholder="Param"/>
              <input class="kv-input" v-model="row.value" placeholder="Value"/>
              <button class="btn-icon-sm" @click="query.splice(index, 1)">
                <k-icon name="trash"/>
              </button>
            </div>
            <button class="btn btn-ghost btn-add" @click="query.push({ enabled: true, key: '', value: '' })">
              <k-icon name="add"/> Add Param
            </button>
          </template>

          <template v-else>
            <textarea
              class="body-input"
              v-model="body"
              placeholder="Request body (JSON, text, etc.)"
              spellcheck="false"
            ></textarea>
          </template>
        </div>
      </div>

      <div class="compose-right">
        <div class="panel-header">
          <div class="response-status" v-if="response">
            <span class="status-code" :class="statusClass(response.status)">
              {{ response.status ? response.status + ' ' + response.statusText : 'Error' }}
            </span>
            <div class="response-meta">
              <span>{{ response.latency }}ms</span>
              <span>{{ formatSize(response.size) }}</span>
              <span v-if="response.headers['content-type']">
                {{ shortContentType(response.headers['content-type']) }}
              </span>
            </div>
          </div>
          <div v-else class="response-empty">No response yet.</div>

          <div style="flex: 1"></div>

          <div class="panel-tabs" v-if="response">
            <span
              class="panel-tab"
              :class="{ active: rightTab === 'body' }"
              @click="rightTab = 'body'"
            >Body</span>
            <span
              class="panel-tab"
              :class="{ active: rightTab === 'headers' }"
              @click="rightTab = 'headers'"
            >Headers</span>
          </div>
        </div>

        <div class="panel-content response-content" v-if="response">
          <template v-if="rightTab === 'body'">
            <template v-if="response.error">
              <div class="response-error">{{ response.error }}</div>
            </template>
            <template v-else>
              <pre>{{ formattedBody }}</pre>
              <div v-if="response.bodyTruncated" class="truncated">[truncated — response body exceeds 64KB]</div>
            </template>
          </template>
          <template v-else>
            <div v-for="(value, key) of response.headers" :key="key" class="kv-readonly">
              <span class="header-key">{{ key }}:</span>
              <span class="header-value">{{ value }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>

import { computed, reactive, ref } from 'vue'
import { send } from '@cordisjs/client'
import type { ComposeResponse } from '../src'

interface KvRow {
  enabled: boolean
  key: string
  value: string
}

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']

const method = ref('GET')
const url = ref('')
const body = ref('')
const headers = reactive<KvRow[]>([
  { enabled: true, key: 'Accept', value: 'application/json' },
])
const query = reactive<KvRow[]>([])

const leftTabs = [
  { id: 'headers', label: 'Headers' },
  { id: 'body', label: 'Body' },
  { id: 'query', label: 'Query' },
]

const leftTab = ref<'headers' | 'body' | 'query'>('headers')
const rightTab = ref<'body' | 'headers'>('body')

const sending = ref(false)
const response = ref<ComposeResponse | null>(null)

function pack(rows: KvRow[]) {
  const out: Record<string, string> = {}
  for (const row of rows) {
    if (row.enabled && row.key) out[row.key] = row.value
  }
  return out
}

async function sendRequest() {
  if (sending.value || !url.value) return
  sending.value = true
  try {
    const result = await send('http-webui.compose', {
      method: method.value,
      url: url.value,
      headers: pack(headers),
      query: pack(query),
      body: body.value || undefined,
    })
    response.value = result as ComposeResponse
    rightTab.value = 'body'
  } finally {
    sending.value = false
  }
}

const formattedBody = computed(() => {
  if (!response.value?.body) return ''
  const ct = response.value.headers['content-type'] ?? ''
  if (!ct.includes('json')) return response.value.body
  try {
    return JSON.stringify(JSON.parse(response.value.body), null, 2)
  } catch {
    return response.value.body
  }
})

function statusClass(status: number) {
  if (!status) return 'status-err'
  return 'status-' + Math.floor(status / 100) + 'xx'
}

function formatSize(bytes: number) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function shortContentType(ct: string) {
  return ct.split(';')[0].trim()
}

</script>

<style lang="scss" scoped>

.http-compose {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.compose-url-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-secondary);
}

.method-select {
  height: 36px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-mono);
  outline: none;
  cursor: pointer;
  appearance: none;
  min-width: 90px;
  text-align: center;
}

.url-input {
  flex: 1;
  height: 36px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  padding: 0 12px;
  font-size: 13px;
  font-family: var(--font-mono);
  color: var(--text-primary);
  outline: none;

  &:focus {
    border-color: var(--border-focus);
  }
}

.btn {
  height: 36px;
  padding: 0 18px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: var(--color-transition);

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-primary {
  background: var(--accent);
  color: white;

  &:hover:not(:disabled) {
    background: var(--accent-hover);
  }
}

.btn-ghost {
  background: transparent;
  color: var(--text-tertiary);
  border: none;
  padding: 4px 8px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &:hover {
    color: var(--text-primary);
  }

  :deep(.k-icon) {
    width: 14px;
    height: 14px;
  }
}

.compose-body {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.compose-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-primary);
  min-width: 0;
}

.compose-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.panel-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-secondary);
  min-height: 40px;
}

.panel-tabs {
  display: flex;
  gap: 0;
}

.panel-tab {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--text-tertiary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  font-weight: 500;
  transition: var(--color-transition);

  &.active {
    color: var(--text-primary);
    border-bottom-color: var(--accent);
  }

  &:hover:not(.active) {
    color: var(--text-secondary);
  }
}

.panel-content {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-primary);
}

.kv-row {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
  align-items: center;
}

.kv-input {
  flex: 1;
  height: 28px;
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

.kv-key {
  flex: 0 0 180px;
}

.kv-checkbox {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
}

.btn-icon-sm {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  cursor: pointer;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  :deep(.k-icon) {
    width: 14px;
    height: 14px;
  }
}

.btn-add {
  margin-top: 8px;
}

.body-input {
  width: 100%;
  min-height: 240px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  padding: 12px;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-primary);
  outline: none;
  resize: vertical;

  &:focus {
    border-color: var(--border-focus);
  }
}

.response-status {
  display: flex;
  align-items: center;
  gap: 12px;
}

.response-empty {
  font-size: 12px;
  color: var(--text-tertiary);
  font-family: var(--font-sans);
}

.status-code {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-mono);

  &.status-2xx { background: var(--success-muted); color: var(--success); }
  &.status-3xx { background: var(--accent-muted);  color: var(--accent); }
  &.status-4xx { background: var(--warning-muted); color: var(--warning); }
  &.status-5xx { background: var(--error-muted);   color: var(--error); }
  &.status-err { background: var(--error-muted);   color: var(--error); }
}

.response-meta {
  font-size: 11px;
  color: var(--text-tertiary);
  display: flex;
  gap: 12px;
  font-family: var(--font-mono);
}

.response-content {
  background: var(--bg-tertiary);
  white-space: pre;

  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-all;
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .truncated {
    margin-top: 12px;
    padding: 8px 12px;
    background: var(--warning-muted);
    color: var(--warning);
    border-radius: var(--radius-sm);
    font-size: 11px;
    white-space: normal;
  }

  .response-error {
    color: var(--error);
    white-space: pre-wrap;
  }

  .kv-readonly {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
    font-family: var(--font-mono);
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;

    .header-key {
      color: var(--accent);
      flex-shrink: 0;
    }

    .header-value {
      color: var(--text-primary);
    }
  }
}

</style>
