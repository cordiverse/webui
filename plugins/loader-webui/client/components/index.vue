<template>
  <k-layout menu="config.tree" :menu-data="currentEntry">
    <template #header>
      <span class="crumb">插件管理</span>
      <template v-if="currentEntry">
        <span class="separator">/</span>
        <span class="crumb">{{ ctx.manager.getLabel(currentEntry) }}</span>
      </template>
    </template>

    <aside class="page-sidebar">
      <tree-view ref="tree"></tree-view>
    </aside>

    <div class="content-area">
      <k-tab-bar
        v-if="currentEntry && routes.length"
        :tabs="routes"
        :active="currentRoute?.path"
        @select="gotoPath"
      />

      <div class="content-body">
        <k-empty v-if="!currentEntry">
          请在左侧选择插件。
        </k-empty>

        <template v-else-if="currentEntry.name in ctx.manager.data.value.packages">
          <k-content v-if="local.runtime === undefined">
            <h1>{{ currentEntry.name }}</h1>
            <k-comment>
              <p>正在加载插件信息……</p>
            </k-comment>
          </k-content>
          <k-content v-else-if="local.runtime === null">
            <h1>{{ currentEntry.name }}</h1>
            <k-comment type="danger">
              <p>插件信息失败，这可能是插件本身的问题所致。请检查错误日志。</p>
            </k-comment>
          </k-content>
          <component v-else
            :is="currentRoute?.component"
            :key="currentEntry.id"
          />
        </template>

        <k-content v-else>
          <h1>{{ currentEntry.name }}</h1>
          <k-slot name="plugin-missing" single>
            <k-comment type="danger">
              <p>此插件尚未安装。</p>
            </k-comment>
          </k-slot>
        </k-content>
      </div>
    </div>
  </k-layout>
</template>

<script setup lang="ts">

import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useContext, send } from '@cordisjs/client'
import TreeView from './tree.vue'
import type { SubRoute } from '..'

interface TabOption {
  id: string
  label: string
}

const ctx = useContext()
const router = useRouter()

const currentEntry = computed(() => ctx.manager.currentEntry)
const currentRoute = computed(() => ctx.manager.currentRoute)
const local = computed(() => ctx.manager.data.value.packages[ctx.manager.currentEntry?.name!])

const tree = ref<InstanceType<typeof TreeView>>()

const routes = computed<TabOption[]>(() => {
  if (!currentEntry.value) return []
  return [...ctx.manager.getRoutes(currentEntry.value)].map((route) => ({
    id: route.path,
    label: route.label,
  }))
})

ctx.client.action.define('config.tree', currentEntry)

watch(local, (value) => {
  if (!value || value.runtime) return
  send('manager.package.runtime', { name: value.package.name })
}, { immediate: true })

function gotoPath(path: string) {
  router.replace('/plugins/' + currentEntry.value!.id + '/' + path)
}

</script>
