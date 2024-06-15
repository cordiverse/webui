<template>
  <k-layout>
    <logs class="layout-logger" :logs="flattenRecords(data)" show-link></logs>
  </k-layout>
</template>

<script lang="ts" setup>

import { useRpc, Dict } from '@cordisjs/client'
import type { Logger } from 'cordis'
import Logs from './logs.vue'
import { flattenRecords } from './utils'

const data = useRpc<Dict<Logger.Record[]>>()

</script>
