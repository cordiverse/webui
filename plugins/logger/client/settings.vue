<template>
  <template v-if="logs?.length">
    <h2 class="k-schema-header">
      运行日志
    </h2>
    <logs class="settings-logger" :logs="logs" max-height="216px"/>
  </template>
</template>

<script setup lang="ts">

import { useRpc, useContext } from '@cordisjs/client'
import { computed } from 'vue'
import {} from '@cordisjs/plugin-manager/client'
import type { Logger } from 'cordis'
import Logs from './logs.vue'

const data = useRpc<Logger.Record[]>()
const ctx = useContext()

const logs = computed(() => {
  if (!data.value) return []
  const results: Logger.Record[] = []
  let last = Infinity
  for (let index = data.value.length - 1; index > 0; --index) {
    if (data.value[index].id >= last) break
    last = data.value[index].id
    if (!data.value[index].meta?.paths?.includes(ctx.manager?.currentEntry?.id)) continue
    results.unshift(data.value[index])
  }
  return results
})

</script>

<style scoped lang="scss">

.settings-logger {
  border-radius: 8px;
  :deep(.logs) {
    padding: 0.5rem 0.5rem;
  }

  @media screen and (max-width: 768px) {
    border-radius: 0;
    margin: 0 calc(0px - var(--content-padding));
  }
}

</style>
