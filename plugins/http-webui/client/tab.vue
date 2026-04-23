<template>
  <div class="http-tab">
    <div class="compose-url-bar">
      <select class="method-select" v-model="state.method">
        <option v-for="m of methods" :key="m" :value="m">{{ m }}</option>
      </select>
      <input
        class="url-input"
        v-model="state.url"
        :placeholder="urlPlaceholder"
        @keyup.enter="primaryAction"
      />
      <button class="btn btn-ghost" :disabled="sending" :title="saveTooltip" @click="$emit('save')">
        保存
      </button>
      <button
        v-if="isWs"
        class="btn"
        :class="wsOpen ? 'btn-ghost' : 'btn-primary'"
        :disabled="wsConnecting || !state.url"
        @click="toggleWs"
      >
        {{ wsConnecting ? 'Connecting...' : wsOpen ? 'Close' : 'Connect' }}
      </button>
      <button
        v-else
        class="btn btn-primary"
        :disabled="sending || !state.url"
        @click="sendRequest"
      >
        {{ sending ? 'Sending...' : 'Send' }}
      </button>
    </div>

    <div class="compose-body">
      <ws-panel
        v-if="isWs"
        :messages="state.wsMessages"
        :query="state.query"
        :can-send="wsOpen"
        :ws-status="wsStatus"
        @send="onWsSend"
        @queue="onWsQueue"
      />
      <template v-else>
        <request :state="state"/>
        <response
          :response="response"
          :sending="sending"
          :streaming="streaming"
          :download-name="downloadName"
        />
      </template>
    </div>
  </div>
</template>

<script lang="ts" setup>

import { computed, onBeforeUnmount, ref } from 'vue'
import Request from './request.vue'
import Response, { type ResponseData } from './response.vue'
import WsPanel from './ws-panel.vue'
import { createSseParser, encodeEvent } from './sse'
import type { BodyType, TabState } from './types'

defineEmits<{
  (e: 'save'): void
}>()

const props = defineProps<{
  state: TabState
  saveTooltip?: string
}>()

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'WS']

const sending = ref(false)
const streaming = ref(false)
const response = ref<ResponseData | null>(null)

const isWs = computed(() => props.state.method === 'WS')

const wsSocket = ref<WebSocket | null>(null)
const wsConnecting = ref(false)
const wsOpen = ref(false)
const wsStatus = ref<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle')

const urlPlaceholder = computed(() => isWs.value ? 'ws://... or wss://...' : 'https://...')

const downloadName = computed(() => {
  try {
    const u = new URL(props.state.url)
    const segments = u.pathname.split('/').filter(Boolean)
    return segments[segments.length - 1] || 'download'
  } catch {
    return 'download'
  }
})

function headersToDict(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((v, k) => { out[k] = v })
  return out
}

function isTextContentType(type: string) {
  if (!type) return true
  if (type.startsWith('text/')) return true
  if (type === 'application/json' || type.endsWith('+json')) return true
  if (type === 'application/xml' || type.endsWith('+xml')) return true
  if (type === 'application/javascript' || type === 'application/x-javascript') return true
  if (type === 'application/x-www-form-urlencoded') return true
  if (type === 'application/yaml' || type === 'application/x-yaml') return true
  return false
}

function contentTypeFor(type: BodyType): string | undefined {
  switch (type) {
    case 'json': return 'application/json'
    case 'xml': return 'application/xml'
    case 'urlencoded': return 'application/x-www-form-urlencoded'
    case 'eventstream': return 'text/event-stream'
    default: return undefined
  }
}

function buildBodyPayload(): BodyInit | undefined {
  switch (props.state.bodyType) {
    case 'none':
      return undefined
    case 'json':
    case 'xml':
      return props.state.body || undefined
    case 'formdata': {
      const fd = new FormData()
      for (const row of props.state.formBody) {
        if (row.enabled && row.key) fd.append(row.key, row.value)
      }
      return fd
    }
    case 'urlencoded': {
      const params = new URLSearchParams()
      for (const row of props.state.formBody) {
        if (row.enabled && row.key) params.append(row.key, row.value)
      }
      return params
    }
    case 'eventstream': {
      if (!props.state.events.length) return undefined
      const now = Date.now()
      for (const ev of props.state.events) {
        if (!ev.ts) ev.ts = now
      }
      return props.state.events.map(encodeEvent).join('')
    }
  }
}

function buildTarget(): URL {
  const target = new URL(props.state.url)
  for (const row of props.state.query) {
    if (row.enabled && row.key) target.searchParams.append(row.key, row.value)
  }
  return target
}

function buildHeaders(): Headers {
  const h = new Headers()
  for (const row of props.state.headers) {
    if (row.enabled && row.key) h.append(row.key, row.value)
  }
  const autoCT = contentTypeFor(props.state.bodyType)
  if (autoCT && !h.has('content-type')) {
    h.set('content-type', autoCT)
  }
  return h
}

async function sendRequest() {
  if (sending.value || !props.state.url) return
  sending.value = true
  streaming.value = false
  if (response.value?.objectUrl) {
    URL.revokeObjectURL(response.value.objectUrl)
  }
  response.value = null
  const start = performance.now()

  try {
    const target = buildTarget()
    const init: RequestInit = {
      method: props.state.method,
      headers: buildHeaders(),
    }
    if (!['GET', 'HEAD'].includes(props.state.method)) {
      init.body = buildBodyPayload()
    }

    const res = await fetch('/proxy/' + target.href, init)
    const ttfb = Math.round(performance.now() - start)
    const resType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const textLike = isTextContentType(resType)

    response.value = {
      status: res.status,
      statusText: res.statusText,
      headers: headersToDict(res.headers),
      body: '',
      latency: ttfb,
      size: 0,
    }
    if (resType === 'text/event-stream') {
      response.value.events = []
    }

    if (res.body) {
      streaming.value = true
      const reader = res.body.getReader()
      let size = 0

      try {
        if (resType === 'text/event-stream') {
          const decoder = new TextDecoder('utf-8', { fatal: false })
          const parser = createSseParser((ev) => {
            response.value?.events?.push(ev)
          })
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            const chunk = decoder.decode(value, { stream: true })
            if (response.value) {
              response.value.size = size
              if (chunk) {
                response.value.body += chunk
                parser.push(chunk)
              }
            }
          }
          const tail = decoder.decode()
          if (tail && response.value) {
            response.value.body += tail
            parser.push(tail)
          }
          parser.flush()
        } else if (textLike) {
          const decoder = new TextDecoder('utf-8', { fatal: false })
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
        } else {
          const chunks: Uint8Array[] = []
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            chunks.push(value)
            if (response.value) response.value.size = size
          }
          if (response.value) {
            const blob = new Blob(chunks, { type: resType || 'application/octet-stream' })
            response.value.objectUrl = URL.createObjectURL(blob)
          }
        }
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

// ---- WebSocket ----

function buildWsProxyUrl(): string {
  // resolve state.url as a URL (may be http/https/ws/wss), then rewrite to ws(s):// against window.location
  const target = buildTarget()
  // The proxy endpoint on the current page uses the page's origin.
  const page = new URL(window.location.href)
  const wsProto = page.protocol === 'https:' ? 'wss:' : 'ws:'
  const prefix = `${wsProto}//${page.host}/proxy/`
  return prefix + target.href
}

function primaryAction() {
  if (isWs.value) {
    toggleWs()
  } else {
    sendRequest()
  }
}

function toggleWs() {
  if (wsOpen.value || wsConnecting.value) {
    closeWs()
  } else {
    connectWs()
  }
}

function connectWs() {
  if (wsConnecting.value || wsOpen.value || !props.state.url) return
  // clear everything except persisted out messages; reset their ts so they re-flush on open
  const kept = props.state.wsMessages.filter(m => m.direction === 'out' && m.persist)
  for (const m of kept) m.ts = 0
  props.state.wsMessages.splice(0, props.state.wsMessages.length, ...kept)

  wsStatus.value = 'connecting'
  wsConnecting.value = true
  let socket: WebSocket
  try {
    socket = new WebSocket(buildWsProxyUrl())
  } catch (e: any) {
    wsStatus.value = 'error'
    wsConnecting.value = false
    props.state.wsMessages.push({
      direction: 'in',
      data: `Error: ${String(e?.message ?? e)}`,
      size: 0,
      ts: Date.now(),
    })
    return
  }
  wsSocket.value = socket
  socket.addEventListener('open', () => {
    wsConnecting.value = false
    wsOpen.value = true
    wsStatus.value = 'open'
    // flush any pending (ts=0) outbound messages in order
    for (const msg of props.state.wsMessages) {
      if (msg.direction === 'out' && !msg.ts) {
        socket.send(msg.data)
        msg.ts = Date.now()
      }
    }
  })
  socket.addEventListener('message', async (event) => {
    let text: string
    let size = 0
    const data = event.data
    if (typeof data === 'string') {
      text = data
      size = new TextEncoder().encode(data).byteLength
    } else if (data instanceof Blob) {
      size = data.size
      try {
        text = await data.text()
      } catch {
        text = `<binary ${size} bytes>`
      }
    } else if (data instanceof ArrayBuffer) {
      size = data.byteLength
      text = `<binary ${size} bytes>`
    } else {
      text = String(data)
    }
    props.state.wsMessages.push({
      direction: 'in',
      data: text,
      size,
      ts: Date.now(),
    })
  })
  socket.addEventListener('close', () => {
    wsOpen.value = false
    wsConnecting.value = false
    wsStatus.value = wsStatus.value === 'error' ? 'error' : 'closed'
    wsSocket.value = null
  })
  socket.addEventListener('error', () => {
    wsStatus.value = 'error'
  })
}

function closeWs() {
  wsSocket.value?.close()
}

function onWsSend(data: string, persist: boolean) {
  const socket = wsSocket.value
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  socket.send(data)
  props.state.wsMessages.push({
    direction: 'out',
    data,
    size: new TextEncoder().encode(data).byteLength,
    ts: Date.now(),
    persist,
  })
}

function onWsQueue(data: string, persist: boolean) {
  props.state.wsMessages.push({
    direction: 'out',
    data,
    size: new TextEncoder().encode(data).byteLength,
    ts: 0,
    persist,
  })
}

onBeforeUnmount(() => {
  if (response.value?.objectUrl) {
    URL.revokeObjectURL(response.value.objectUrl)
  }
  wsSocket.value?.close()
})

defineExpose({ sendRequest })

</script>

<style lang="scss" scoped>

.http-tab {
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
  display: inline-flex;
  align-items: center;
  gap: 6px;

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
  color: var(--text-secondary);
  border: 1px solid var(--border-primary);
  padding: 0 14px;

  &:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
}

.compose-body {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  overflow: hidden;

  > :first-child {
    border-right: 1px solid var(--border-primary);
  }
}

</style>
