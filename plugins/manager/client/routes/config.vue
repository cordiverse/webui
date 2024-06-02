<template>
  <k-content v-if="currentEntry && local.runtime?.schema">
    <div class="flex flex-wrap gap-x-4 gap-y-2 my-8">
      <span class="el-button" target="_blank"
        @click="router.replace('/plugins/' + currentEntry.id)"
      >回到概览</span>
    </div>
    <k-form :schema="local.runtime.schema" :initial="currentEntry.config" v-model="ctx.manager.changes[currentEntry.id].config">
    </k-form>
  </k-content>
  <k-empty v-else>
    当前插件未声明配置。
  </k-empty>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import { router, useContext, useRpc } from '@cordisjs/client'
import { Data } from '../../src'

const ctx = useContext()
const data = useRpc<Data>()

const currentEntry = computed(() => ctx.manager.currentEntry)
const local = computed(() => data.value.packages[currentEntry.value?.name!])

</script>
