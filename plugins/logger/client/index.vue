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
import { Message } from 'reggol'
import Logs from './logs.vue'

const input = ref('')

function filter(record: Message) {
  return !input.value || record.body.includes(input.value)
}

</script>
