<template>
  <k-content v-if="currentEntry && info">
    <k-comment
      :type="info.location ? 'success' : info.required ? 'warning' : 'primary'">
      <p>{{ info.required ? '必需' : '可选' }}服务 {{ name }} {{ info.location ? '已加载' : '未加载' }}。</p>
    </k-comment>
    <k-form
      v-if="info.schema"
      v-bind="formProps"
      :schema="info.schema"
      :initial="currentEntry.intercept?.[name]"
      v-model="ctx.manager.changes[currentEntry.id].intercept![name]"
    />
  </k-content>
  <k-empty v-else>
    当前插件未依赖服务 {{ name }}。
  </k-empty>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import { useContext } from '@cordisjs/client'
import { formProps } from './utils'

const ctx = useContext()

const currentEntry = computed(() => ctx.manager.currentEntry!)
const name = computed(() => ctx.manager.currentRoute!.params!.name)
const info = computed(() => ctx.manager.getEnvInfo(currentEntry.value)?.using[name.value])

</script>
