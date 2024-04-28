<template>
  <template v-if="current?.name in data.packages">
    <k-comment v-if="!local.runtime">
      <p>正在加载插件配置……</p>
    </k-comment>
    <k-comment v-else-if="local.runtime.failed" type="danger">
      <p>插件加载失败，这可能是插件本身的问题所致。{{ hint }}</p>
    </k-comment>

    <k-slot v-else name="plugin-details">
      <!-- dependency -->
      <k-slot-item :order="800">
        <k-slot name="plugin-dependency" single>
          <k-comment
            v-for="({ required, active }, name) in env.peer" :key="name"
            :type="active ? 'success' : required ? 'warning' : 'primary'">
            <p>
              {{ required ? '必需' : '可选' }}依赖：{{ name }} ({{ active ? '已加载' : '未加载' }})
            </p>
          </k-comment>
          <k-comment
            v-for="({ required }, name) in env.using" :key="name"
            :type="name in data.services ? 'success' : required ? 'warning' : 'primary'">
            <p>
              {{ required ? '必需' : '可选' }}服务：{{ name }} ({{ name in data.services ? '已加载' : '未加载' }})
            </p>
          </k-comment>
        </k-slot>
      </k-slot-item>

      <!-- implements -->
      <k-slot-item :order="600">
        <template v-for="name in env.impl" :key="name">
          <k-comment v-if="name in data.services && current.disabled" type="warning">
            <p>此插件将会提供 {{ name }} 服务，但此服务已被其他插件实现。</p>
          </k-comment>
          <k-comment v-else :type="current.disabled ? 'primary' : 'success'">
            <p>此插件{{ current.disabled ? '启用后将会提供' : '提供了' }} {{ name }} 服务。</p>
          </k-comment>
        </template>
      </k-slot-item>

      <!-- reusability -->
      <k-slot-item :order="400">
        <k-comment v-if="local.runtime.id && !local.runtime.forkable && current.disabled" type="warning">
          <p>此插件已在运行且不可重用，启用可能会导致非预期的问题。</p>
        </k-comment>
        <k-comment v-if="plugins.forks[current.name]?.length > 1" type="primary">
          <p>此插件存在多份配置，<span class="k-link" @click.stop="dialogFork = current.name">点击前往管理</span>。</p>
        </k-comment>
      </k-slot-item>

      <!-- implements -->
      <k-slot-item :order="300">
        <template v-for="(activity, key) in ctx.$router.pages" :key="key">
          <k-comment type="success" v-if="activity.ctx.$entry?.paths.includes(current.path) && !activity.disabled()">
            <p>
              <span>此插件提供了页面：</span>
              <k-activity-link :id="activity.id" />
            </p>
          </k-comment>
        </template>
      </k-slot-item>

      <!-- usage -->
      <k-slot-item :order="-200" v-if="local.runtime?.usage">
        <k-markdown unsafe class="usage" :source="local.runtime?.usage"></k-markdown>
      </k-slot-item>

      <!-- modifier -->
      <k-slot-item :order="-600">
      </k-slot-item>

      <!-- config -->
      <k-slot-item :order="-1000">
        <k-comment v-if="!local.runtime.schema" type="warning">
          <p>此插件未声明配置项，这可能并非预期行为。{{ hint }}</p>
        </k-comment>
        <k-form v-else :schema="local.runtime.schema" :initial="current.config" v-model="config">
          <template #hint>{{ hint }}</template>
        </k-form>
      </k-slot-item>
    </k-slot>
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

const dialogFork = computed({
  get: () => ctx.manager.dialogFork.value,
  set: (value) => ctx.manager.dialogFork.value = value,
})

const config = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const env = computed(() => ctx.manager.getEnvInfo(current.value?.name))
const local = computed(() => data.value.packages[current.value?.name])
const hint = computed(() => local.value.workspace ? '请检查插件源代码。' : '请联系插件作者并反馈此问题。')

watch(local, (value) => {
  if (!value || value.runtime) return
  send('manager.package.runtime', value.name)
}, { immediate: true })

provide('plugin:name', name)
provide('plugin:env', env)
provide('manager.settings.local', local)
provide('manager.settings.config', config)
provide('manager.settings.current', current)

</script>

<style lang="scss">

.plugin-view {
  .markdown.usage {
    margin-bottom: 2rem;

    h2 {
      font-size: 1.25rem;
    }
  }
}

</style>
