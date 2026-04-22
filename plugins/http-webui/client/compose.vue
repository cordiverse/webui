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
              @click="leftTab = t.id"
            >{{ t.label }}</span>
          </div>
        </div>

        <template v-if="leftTab === 'headers'">
          <div class="panel-content">
            <div v-for="(row, index) of headers" :key="index" class="kv-row">
              <input
                type="checkbox"
                class="kv-checkbox"
                :class="{ invisible: isTrailing(headers, index) }"
                v-model="row.enabled"
              />
              <input
                class="kv-input kv-key"
                v-model="row.key"
                placeholder="Header Key"
                @input="ensureTrailing(headers)"
              />
              <input
                class="kv-input"
                v-model="row.value"
                placeholder="Header Value"
                @input="ensureTrailing(headers)"
              />
              <button
                class="btn-icon-sm"
                :class="{ invisible: isTrailing(headers, index) }"
                @click="removeRow(headers, index)"
              >
                <k-icon name="trash"/>
              </button>
            </div>
          </div>
        </template>

        <template v-else-if="leftTab === 'query'">
          <div class="panel-content">
            <div v-for="(row, index) of query" :key="index" class="kv-row">
              <input
                type="checkbox"
                class="kv-checkbox"
                :class="{ invisible: isTrailing(query, index) }"
                v-model="row.enabled"
              />
              <input
                class="kv-input kv-key"
                v-model="row.key"
                placeholder="Param Key"
                @input="ensureTrailing(query)"
              />
              <input
                class="kv-input"
                v-model="row.value"
                placeholder="Param Value"
                @input="ensureTrailing(query)"
              />
              <button
                class="btn-icon-sm"
                :class="{ invisible: isTrailing(query, index) }"
                @click="removeRow(query, index)"
              >
                <k-icon name="trash"/>
              </button>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="body-type-bar">
            <el-select v-model="bodyType" size="small">
              <el-option v-for="opt of bodyTypeOptions" :key="opt.id" :value="opt.id" :label="opt.label"/>
            </el-select>
          </div>

          <template v-if="bodyType === 'json' || bodyType === 'xml'">
            <textarea
              class="body-input flush"
              v-model="body"
              :placeholder="bodyType === 'json' ? '{\n  \&quot;key\&quot;: \&quot;value\&quot;\n}' : '<root></root>'"
              spellcheck="false"
            ></textarea>
          </template>

          <template v-else-if="bodyType === 'formdata' || bodyType === 'urlencoded'">
            <div class="panel-content">
              <div v-for="(row, index) of formBody" :key="index" class="kv-row">
                <input
                  type="checkbox"
                  class="kv-checkbox"
                  :class="{ invisible: isTrailing(formBody, index) }"
                  v-model="row.enabled"
                />
                <input
                  class="kv-input kv-key"
                  v-model="row.key"
                  placeholder="Field Key"
                  @input="ensureTrailing(formBody)"
                />
                <input
                  class="kv-input"
                  v-model="row.value"
                  placeholder="Field Value"
                  @input="ensureTrailing(formBody)"
                />
                <button
                  class="btn-icon-sm"
                  :class="{ invisible: isTrailing(formBody, index) }"
                  @click="removeRow(formBody, index)"
                >
                  <k-icon name="trash"/>
                </button>
              </div>
            </div>
          </template>

          <div v-else class="body-empty">No body.</div>
        </template>
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
            <template v-if="response.error && !response.body">
              <div class="response-error">{{ response.error }}</div>
            </template>
            <template v-else>
              <pre>{{ formattedBody }}<span v-if="streaming" class="stream-cursor">▍</span></pre>
              <div v-if="response.error" class="response-error">{{ response.error }}</div>
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

interface KvRow {
  enabled: boolean
  key: string
  value: string
}

type BodyType = 'none' | 'json' | 'xml' | 'formdata' | 'urlencoded'

interface ComposeResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  bodyTruncated?: boolean
  latency: number
  size: number
  error?: string
}

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']

const method = ref('GET')
const url = ref('')
const body = ref('')
const bodyType = ref<BodyType>('none')
const headers = reactive<KvRow[]>([
  { enabled: true, key: 'Accept', value: 'application/json' },
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
const rightTab = ref<'body' | 'headers'>('body')

const sending = ref(false)
const streaming = ref(false)
const response = ref<ComposeResponse | null>(null)

function isTrailing(rows: KvRow[], index: number) {
  return index === rows.length - 1 && !rows[index].key && !rows[index].value
}

function ensureTrailing(rows: KvRow[]) {
  const last = rows[rows.length - 1]
  if (!last || last.key || last.value) {
    rows.push({ enabled: true, key: '', value: '' })
  }
}

function removeRow(rows: KvRow[], index: number) {
  rows.splice(index, 1)
  ensureTrailing(rows)
}

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

function buildHeaders(autoContentType?: string): Headers {
  const h = new Headers()
  for (const row of headers) {
    if (row.enabled && row.key) h.append(row.key, row.value)
  }
  if (autoContentType && !h.has('content-type')) {
    h.set('content-type', autoContentType)
  }
  return h
}

function headersToDict(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((v, k) => { out[k] = v })
  return out
}

async function sendRequest() {
  if (sending.value || !url.value) return
  sending.value = true
  streaming.value = false
  response.value = null
  const start = performance.now()

  try {
    const target = new URL(url.value)
    for (const row of query) {
      if (row.enabled && row.key) target.searchParams.append(row.key, row.value)
    }

    const autoCT = contentTypeFor(bodyType.value)
    const requestHeaders = buildHeaders(autoCT)

    const init: RequestInit = {
      method: method.value,
      headers: requestHeaders,
    }
    if (!['GET', 'HEAD'].includes(method.value)) {
      init.body = buildBody()
    }

    const res = await fetch('/proxy/' + target.href, init)
    const ttfb = Math.round(performance.now() - start)

    response.value = {
      status: res.status,
      statusText: res.statusText,
      headers: headersToDict(res.headers),
      body: '',
      latency: ttfb,
      size: 0,
    }
    rightTab.value = 'body'

    if (res.body) {
      streaming.value = true
      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8', { fatal: false })
      let size = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          const chunk = decoder.decode(value, { stream: true })
          if (response.value) {
            response.value.size = size
            if (chunk) response.value.body += chunk
          }
        }
        const tail = decoder.decode()
        if (response.value && tail) response.value.body += tail
      } catch (e: any) {
        if (response.value) response.value.error = String(e?.message ?? e)
      }
      if (response.value) {
        response.value.latency = Math.round(performance.now() - start)
      }
    }
  } catch (e: any) {
    const latency = Math.round(performance.now() - start)
    response.value = {
      status: 0,
      statusText: 'Error',
      headers: {},
      body: '',
      latency,
      size: 0,
      error: String(e?.message ?? e),
    }
  } finally {
    sending.value = false
    streaming.value = false
  }
}

const formattedBody = computed(() => {
  if (!response.value?.body) return ''
  if (streaming.value) return response.value.body
  const type = response.value.headers['content-type'] ?? ''
  if (!type.includes('json')) return response.value.body
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

function shortContentType(type: string) {
  return type.split(';')[0].trim()
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
  align-items: stretch;
  gap: 8px;
  padding: 0 16px;
  height: 36px; // var(--tab-bar-height)
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-secondary);

  > .response-status,
  > .response-empty {
    align-self: center;
  }
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
  flex-shrink: 0;

  &.invisible {
    visibility: hidden;
  }
}

.btn-icon-sm {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.invisible {
    visibility: hidden;
  }

  :deep(.k-icon) {
    width: 14px;
    height: 14px;
  }
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

  &.flush {
    border: none;
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

  .stream-cursor {
    display: inline-block;
    color: var(--accent);
    animation: blink 1s steps(2, start) infinite;
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

@keyframes blink {
  to { visibility: hidden; }
}

</style>
