<template>
  <k-content v-if="currentEntry && info">
    <k-comment
      :type="info.provider ? 'success' : info.required ? 'warning' : 'primary'">
      <p>
        <span>{{ info.required ? '必需' : '可选' }}服务 {{ name }} {{ info.provider ? '已加载' : '未加载' }}</span>
        <span v-if="info.provider && canGoto(info.provider.location)"> (<span class="k-link" @click="goProvider(info.provider.location)">前往来源</span>)</span>
        <span>。</span>
      </p>
    </k-comment>
    <k-form
      v-if="info.provider?.schema"
      v-bind="formProps"
      :schema="info.provider?.schema"
      :initial="info.config"
      v-model="ctx.manager.changes[currentEntry.id].intercept![name]"
    />
  </k-content>
  <k-empty v-else>
    当前插件未依赖服务 {{ name }}。
  </k-empty>
</template>

<script lang="ts" setup>

import { computed, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { clone, useContext } from '@cordisjs/client'
import { formProps } from './utils'

const ctx = useContext()
const router = useRouter()

const currentEntry = computed(() => ctx.manager.currentEntry!)
const name = computed(() => ctx.manager.currentRoute!.params!.name)
const info = computed(() => ctx.manager.getEnvInfo(currentEntry.value)?.using[name.value])

function canGoto(location?: string) {
  return !!location && location in ctx.manager.plugins.value.entries
}

function goProvider(location?: string) {
  if (canGoto(location)) router.push('/plugins/' + location)
}

watchEffect(() => {
  const change = ctx.manager.changes[currentEntry.value?.id]
  if (!change || info.value?.config === undefined) return
  if (change.intercept![name.value] === undefined) {
    change.intercept![name.value] = clone(info.value.config)
  }
})

</script>
