<template>
  <k-content v-if="currentEntry && local.runtime?.schema">
    <k-form
      v-bind="formProps"
      :schema="local.runtime.schema"
      :initial="currentEntry.config"
      v-model="ctx.manager.changes[currentEntry.id].config"
    />
  </k-content>
  <k-empty v-else>
    当前插件未声明配置。
  </k-empty>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import { useContext, useRpc } from '@cordisjs/client'
import { formProps } from './utils'
import { Data } from '../../src'

const ctx = useContext()
const data = useRpc<Data>()

const currentEntry = computed(() => ctx.manager.currentEntry!)
const local = computed(() => data.value.packages[currentEntry.value.name])

</script>
