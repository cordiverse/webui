<template>
  <k-layout>
    <template #header>
      <span class="crumb">HTTP History</span>
    </template>

    <template #menu>
      <span class="menu-item" @click="clearHistory" title="Clear">
        <k-icon class="menu-icon" name="trash"/>
      </span>
    </template>

    <history ref="historyRef"/>
  </k-layout>
</template>

<script lang="ts" setup>

import { useContext } from '@cordisjs/client'
import { useRouter } from 'vue-router'
import History from './history.vue'
import { emptyKvRow, type TabState } from './types'
import { pendingTab } from './state'
import type { HistoryEntry } from '../src'
import { send } from '@cordisjs/client'

const ctx = useContext()
const router = useRouter()

function stateFromHistory(entry: HistoryEntry): TabState {
  let url = entry.url
  let query = [emptyKvRow()]
  try {
    const u = new URL(entry.url)
    const params: Record<string, string> = {}
    for (const [k, v] of u.searchParams) params[k] = v
    query = kvFromDict(params)
    u.search = ''
    url = u.href.replace(/\?$/, '')
  } catch {}
  return {
    method: entry.method,
    url,
    headers: kvFromDict(entry.requestHeaders),
    query,
    body: '',
    bodyType: 'none',
    formBody: [emptyKvRow()],
    events: [],
    wsMessages: [],
  }
}

function kvFromDict(dict: Record<string, string> | undefined) {
  const rows = Object.entries(dict ?? {}).map(([key, value]) => ({ enabled: true, key, value }))
  rows.push(emptyKvRow())
  return rows
}

ctx.client.action.menu('httpHistory', [
  { id: '.open', label: '在 Compose 中打开' },
  { id: '.save', label: '保存此请求' },
])

ctx.client.action.action('httpHistory.open', {
  action: ({ httpHistory }: any) => {
    if (!httpHistory) return
    pendingTab.value = { state: stateFromHistory(httpHistory) }
    router.push('/http/compose')
  },
})

ctx.client.action.action('httpHistory.save', {
  action: ({ httpHistory }: any) => {
    if (!httpHistory) return
    pendingTab.value = { state: stateFromHistory(httpHistory), openSaveDialog: true }
    router.push('/http/compose')
  },
})

function clearHistory() {
  send('http-webui.clear')
}

</script>
