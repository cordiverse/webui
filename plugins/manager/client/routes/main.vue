<template>
  <k-content v-if="current && local.runtime">
    <h1>{{ current.name }}</h1>
    <p v-if="local.manifest.description">{{ local.manifest.description }}</p>

    <k-slot name="plugin-details">
      <!-- dependency -->
      <k-slot-item :order="800">
        <k-slot name="plugin-dependency" single>
          <k-comment
            v-for="({ required, provider }, name) in env.using" :key="name"
            :type="provider ? 'success' : required ? 'warning' : 'primary'">
            <p>
              {{ required ? '必需' : '可选' }}服务：{{ name }}
              <template v-if="provider">
                (<span :class="{ 'k-link': provider.length }" @click="gotoProvider(provider)">已加载</span>)
              </template>
              <template v-else>(未加载)</template>
            </p>
          </k-comment>
        </k-slot>
      </k-slot-item>

      <!-- implements -->
      <k-slot-item :order="600">
        <template v-for="name in env.impl" :key="name">
          <k-comment v-if="name in ctx.manager.data.value.services && current.disabled" type="warning">
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
        <k-comment v-if="ctx.manager.plugins.value.forks[current.name]?.length > 1" type="primary">
          <p>此插件存在多份配置，<span class="k-link" @click.stop="ctx.manager.dialogFork = current.name">点击前往管理</span>。</p>
        </k-comment>
      </k-slot-item>

      <!-- implements -->
      <k-slot-item :order="300">
        <template v-for="(activity, key) in ctx.$router.pages" :key="key">
          <k-comment type="success" v-if="activity.ctx.$entry?.paths.includes(current.id) && !activity.disabled()">
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

      <k-slot-item :order="-1000" v-if="configState">
        <k-comment :type="configState[0]">
          <p class="flex items-center">
            <span class="grow-1">{{ configState[1] }}</span>
            <span
              class="h-8 w-8 my--1 mr--1 p-0 flex items-center justify-center el-button"
              @click="router.push('/plugins/' + current.id + '/config')"
            >
              <k-icon name="arrow-right"></k-icon>
            </span>
          </p>
        </k-comment>
      </k-slot-item>
    </k-slot>
  </k-content>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import { router, useContext, deepEqual } from '@cordisjs/client'
import { hasSchema } from '../utils'

const ctx = useContext()

const current = computed(() => ctx.manager.currentEntry)
const local = computed(() => ctx.manager.data.value.packages[current.value?.name!])
const change = computed(() => ctx.manager.changes[current.value?.id!])
const env = computed(() => ctx.manager.getEnvInfo(current.value)!)

function gotoProvider(provider: string[]) {
  if (!provider.length) return
  router.push('/plugins/' + provider[0])
}

const configState = computed(() => {
  if (!hasSchema(local.value.runtime?.schema)) return
  if (deepEqual(change.value.config, current.value!.config)) {
    return ['success', '此插件提供了配置项。']
  } else if (ctx.manager.checkConfig(current.value!)) {
    return ['warning', '当前存在未保存的配置项。']
  } else {
    return ['error', '当前配置项不满足约束，请检查配置。']
  }
})

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
