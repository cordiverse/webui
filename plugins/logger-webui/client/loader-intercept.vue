<template>
  <template v-if="shouldShow">
    <h2>运行日志</h2>
    <div class="logger-card">
      <logs :filter="filter" max-height="480px"/>
    </div>
  </template>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import { useContext } from '@cordisjs/client'
import type {} from '@cordisjs/plugin-loader-webui/client'
import type { Message } from 'reggol'
import Logs from './logs.vue'

const ctx = useContext()

const shouldShow = computed(() => {
  return ctx.manager?.currentRoute?.params?.name === 'logger'
})

function filter(message: Message) {
  const entry = ctx.manager?.currentEntry
  if (!entry) return false
  return message.entryId === (ctx.manager?.prefix ?? '') + entry.id
}

</script>

<style lang="scss" scoped>

.logger-card {
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  overflow: hidden;
  max-height: 400px;
}

</style>
