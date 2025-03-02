<template>
  <k-layout>
    <template #menu>
      <el-input v-model="input">
        <template #suffix>
          <k-icon name="search"/>
        </template>
      </el-input>
    </template>
    <logs class="layout-logger" :filter="filter" show-link show-history></logs>
  </k-layout>
</template>

<script lang="ts" setup>

import { ref } from 'vue'
import type { Logger } from 'cordis/logger'
import Logs from './logs.vue'

const input = ref('')

function filter(record: Logger.Record) {
  return !input.value || record.content.includes(input.value)
}

</script>
