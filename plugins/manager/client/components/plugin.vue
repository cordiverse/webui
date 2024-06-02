<template>
  <template v-if="current && current.name in data.packages">
    <k-comment v-if="!local.runtime">
      <p>正在加载插件配置……</p>
    </k-comment>
    <k-comment v-else-if="local.runtime.failed" type="danger">
      <p>插件加载失败，这可能是插件本身的问题所致。{{ hint }}</p>
    </k-comment>
    <template v-else>
      <router-view></router-view>
    </template>
  </template>

  <template v-else>
    <k-slot name="plugin-missing" single>
      <k-comment type="danger">
        <p>此插件尚未安装。</p>
      </k-comment>
    </k-slot>
  </template>
</template>

<script lang="ts" setup>

import { send, useContext, useRpc } from '@cordisjs/client'
import { computed, provide, watch } from 'vue'
import { Data } from '../../src'

const props = defineProps<{
  modelValue: any
}>()

const emit = defineEmits(['update:modelValue'])

const ctx = useContext()
const data = useRpc<Data>()

const current = computed(() => ctx.manager.current.value)
const plugins = computed(() => ctx.manager.plugins.value)

const config = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const env = computed(() => ctx.manager.getEnvInfo(current.value)!)
const local = computed(() => data.value.packages[current.value?.name!])
const hint = computed(() => local.value.workspace ? '请检查插件源代码。' : '请联系插件作者并反馈此问题。')

watch(local, (value) => {
  if (!value || value.runtime) return
  send('manager.package.runtime', { name: value.package.name })
}, { immediate: true })

provide('manager.settings.local', local)
provide('manager.settings.config', config)
provide('manager.settings.current', current)

</script>

<style lang="scss">

</style>
