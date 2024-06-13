<template>
  <k-layout>
    <logs class="layout-logger" :logs="data" show-link></logs>
  </k-layout>
</template>

<script lang="ts" setup>

import { useRpc } from '@cordisjs/client'
import type { Logger } from 'cordis'
import Logs from './logs.vue'

const data = useRpc<Logger.Record[]>()

</script>
