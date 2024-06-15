<template>
  <template v-if="logs?.length">
    <h2 class="k-schema-header">
      运行日志
    </h2>
    <logs class="settings-logger" :logs="logs" max-height="216px"/>
  </template>
</template>

<script setup lang="ts">

import { Dict, useRpc, useContext } from '@cordisjs/client'
import { computed } from 'vue'
import {} from '@cordisjs/plugin-manager/client'
import type { Logger } from 'cordis'
import { flattenRecords } from './utils'
import Logs from './logs.vue'

const data = useRpc<Dict<Logger.Record[] | null>>()
const ctx = useContext()

const logs = computed(() => {
  return flattenRecords(data.value).filter(record => {
    return record.meta.paths?.includes(ctx.manager?.currentEntry?.id!)
  })
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
