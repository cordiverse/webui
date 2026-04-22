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
      <request ref="requestRef"/>
      <response
        :response="response"
        :sending="sending"
        :streaming="streaming"
        :download-name="downloadName"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>

import { computed, onBeforeUnmount, ref } from 'vue'
import Request from './request.vue'
import Response, { type ResponseData } from './response.vue'

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']

const method = ref('GET')
const url = ref('')
const sending = ref(false)
const streaming = ref(false)
const response = ref<ResponseData | null>(null)
const requestRef = ref<InstanceType<typeof Request>>()

const downloadName = computed(() => {
  try {
    const u = new URL(url.value)
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

async function sendRequest() {
  if (sending.value || !url.value || !requestRef.value) return
  sending.value = true
  streaming.value = false
  if (response.value?.objectUrl) {
    URL.revokeObjectURL(response.value.objectUrl)
  }
  response.value = null
  const start = performance.now()

  try {
    const { url: target, init } = requestRef.value.build(url.value, method.value)
    const res = await fetch('/proxy/' + target, init)
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

    if (res.body) {
      streaming.value = true
      const reader = res.body.getReader()
      let size = 0

      try {
        if (textLike) {
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
          const chunks: Uint8Array<ArrayBuffer>[] = []
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

onBeforeUnmount(() => {
  if (response.value?.objectUrl) {
    URL.revokeObjectURL(response.value.objectUrl)
  }
})

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

  > :first-child {
    border-right: 1px solid var(--border-primary);
  }
}

</style>
