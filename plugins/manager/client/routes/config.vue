<template>
  <k-content v-if="currentEntry && local.runtime?.schema">
    <k-form :schema="local.runtime.schema" :initial="currentEntry.config" v-model="config">
    </k-form>
  </k-content>
  <k-empty v-else>
    当前插件未声明配置。
  </k-empty>
</template>

<script lang="ts" setup>

import { computed, ref, watch } from 'vue'
import { clone, useContext, useRpc } from '@cordisjs/client'
import { Data } from '../../src'

const ctx = useContext()
const data = useRpc<Data>()
const config = ref()

const currentEntry = computed(() => ctx.manager.currentEntry)
const local = computed(() => data.value.packages[currentEntry.value?.name!])

watch(currentEntry, (value) => {
  if (!value) return
  config.value = clone(value.config)
}, { immediate: true })

</script>
