<template>
  <div class="response-root">
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

      <div style="flex: 1"></div>

      <div class="panel-tabs" v-if="response">
        <span
          class="panel-tab"
          :class="{ active: tab === 'body' }"
          @click="tab = 'body'"
        >Body</span>
        <span
          class="panel-tab"
          :class="{ active: tab === 'headers' }"
          @click="tab = 'headers'"
        >Headers</span>
      </div>
    </div>

    <div v-if="!response" class="response-placeholder">
      <template v-if="sending">
        <div class="spinner"></div>
        <span>正在发送请求...</span>
      </template>
      <template v-else>
        <span>点击 Send 发送请求。</span>
      </template>
    </div>

    <div v-else-if="tab === 'headers'" class="panel-content response-content">
      <div v-for="(value, key) of response.headers" :key="key" class="kv-readonly">
        <span class="header-key">{{ key }}:</span>
        <span class="header-value">{{ value }}</span>
      </div>
    </div>

    <template v-else>
      <div
        v-if="response.error && !response.body && !response.objectUrl"
        class="panel-content response-content"
      >
        <div class="response-error">{{ response.error }}</div>
      </div>
      <div v-else-if="isText" class="panel-content response-content">
        <pre>{{ formattedBody }}<span v-if="streaming" class="stream-cursor">▍</span></pre>
        <div v-if="response.error" class="response-error">{{ response.error }}</div>
      </div>
      <div v-else-if="isImage" class="response-media-wrap">
        <img v-if="response.objectUrl" :src="response.objectUrl" class="response-image"/>
        <template v-else-if="streaming">
          <div class="spinner"></div>
          <span>正在接收图片...</span>
        </template>
        <div v-else class="response-error">{{ response.error || '图片接收失败' }}</div>
      </div>
      <div v-else-if="isAudio" class="response-media-wrap">
        <audio v-if="response.objectUrl" :src="response.objectUrl" controls class="response-audio"></audio>
        <template v-else-if="streaming">
          <div class="spinner"></div>
          <span>正在接收音频...</span>
        </template>
        <div v-else class="response-error">{{ response.error || '音频接收失败' }}</div>
      </div>
      <div v-else-if="isVideo" class="response-media-wrap">
        <video v-if="response.objectUrl" :src="response.objectUrl" controls class="response-video"></video>
        <template v-else-if="streaming">
          <div class="spinner"></div>
          <span>正在接收视频...</span>
        </template>
        <div v-else class="response-error">{{ response.error || '视频接收失败' }}</div>
      </div>
      <div v-else class="response-download">
        <div class="download-info">
          <div class="download-type">
            {{ shortContentType(response.headers['content-type'] || '') || 'Binary Response' }}
          </div>
          <div class="download-size">{{ formatSize(response.size) }}</div>
        </div>
        <a
          v-if="response.objectUrl"
          :href="response.objectUrl"
          :download="downloadName"
          class="btn btn-primary"
        >下载文件</a>
        <div v-else class="spinner"></div>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>

import { computed, ref } from 'vue'

export interface ResponseData {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  objectUrl?: string
  latency: number
  size: number
  error?: string
}

const props = defineProps<{
  response: ResponseData | null
  sending: boolean
  streaming: boolean
  downloadName?: string
}>()

const tab = ref<'body' | 'headers'>('body')

defineExpose({ tab })

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

const contentType = computed(() => {
  return (props.response?.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
})

const isText = computed(() => isTextContentType(contentType.value))
const isImage = computed(() => contentType.value.startsWith('image/'))
const isAudio = computed(() => contentType.value.startsWith('audio/'))
const isVideo = computed(() => contentType.value.startsWith('video/'))

const formattedBody = computed(() => {
  if (!props.response?.body) return ''
  if (props.streaming) return props.response.body
  if (!contentType.value.includes('json')) return props.response.body
  try {
    return JSON.stringify(JSON.parse(props.response.body), null, 2)
  } catch {
    return props.response.body
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

.response-root {
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

  > .response-status {
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

.response-status {
  display: flex;
  align-items: center;
  gap: 12px;
}

.response-meta {
  font-size: 11px;
  color: var(--text-tertiary);
  display: flex;
  gap: 12px;
  font-family: var(--font-mono);
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

.response-placeholder {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-tertiary);
  font-size: 13px;
  background: var(--bg-tertiary);
}

.response-media-wrap {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  background: var(--bg-tertiary);
  overflow: auto;
}

.response-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.response-audio {
  width: 100%;
  max-width: 480px;
}

.response-video {
  max-width: 100%;
  max-height: 100%;
}

.response-download {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
  background: var(--bg-tertiary);

  .download-info {
    text-align: center;

    .download-type {
      font-family: var(--font-mono);
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .download-size {
      font-size: 12px;
      color: var(--text-tertiary);
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
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }

  .btn-primary {
    background: var(--accent);
    color: white;

    &:hover {
      background: var(--accent-hover);
    }
  }
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

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-primary);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes blink {
  to { visibility: hidden; }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

</style>
