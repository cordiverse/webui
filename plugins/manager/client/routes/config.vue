<template>
  <template v-if="current && local.runtime?.schema">
    <k-form :schema="local.runtime.schema" :initial="current!.config" v-model="config">
    </k-form>
  </template>
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

const current = computed(() => ctx.manager.current.value)
const local = computed(() => data.value.packages[current.value?.name!])

watch(current, (value) => {
  if (!value) return
  config.value = clone(value.config)
}, { immediate: true })

</script>
