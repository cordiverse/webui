<template>
  <k-content v-if="currentEntry && local.runtime?.schema">
    <div class="flex flex-wrap gap-x-4 gap-y-2 my-8">
      <el-button
        @click="router.replace('/plugins/' + currentEntry.id)">
        <k-icon name="arrow-left" class="h-3.25 mr-2"/>
        回到概览
      </el-button>
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

const currentEntry = computed(() => ctx.manager.currentEntry!)
const local = computed(() => data.value.packages[currentEntry.value.name])

</script>
