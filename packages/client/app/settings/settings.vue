<template>
  <k-layout>
    <template #header>
      {{ ctx.client.setting._settings[path][0]?.title }}
    </template>

    <aside class="page-sidebar">
      <el-scrollbar>
        <el-tree
          ref="tree"
          :data="data"
          :default-expand-all="true"
          @node-click="handleClick"
        ></el-tree>
      </el-scrollbar>
    </aside>

    <div class="content-area">
      <k-tab-bar v-if="tabs.length > 1" :tabs="tabs" :active="activeTab" @select="activeTab = $event" />
      <div class="content-body page-settings">
        <keep-alive>
          <k-content :key="path">
            <template v-for="(item, index) of currentItems" :key="index">
              <template v-if="item.disabled?.()"></template>
              <component v-else-if="item.component" :is="item.component" />
              <k-form v-else-if="item.schema" :schema="item.schema" v-model="config" :initial="config" />
            </template>
          </k-content>
        </keep-alive>
      </div>
    </div>
  </k-layout>
</template>

<script lang="ts" setup>

import { useRoute, useRouter, useConfig, useContext } from '@cordisjs/client'
import { computed, ref } from 'vue'

interface TabOption {
  id: string
  label: string
}

const route = useRoute()
const router = useRouter()

const config = useConfig(true)
const ctx = useContext()

interface Tree {
  id: string
  label?: string
  children?: Tree[]
}

const data = computed(() => Object.entries(ctx.client.setting._settings).map<Tree>(([id, [{ title }]]) => ({
  id,
  label: title,
})))

function handleClick(tree: Tree) {
  if (tree.children) return
  path.value = tree.id
}

const path = computed({
  get() {
    const name = route.params.name?.toString()
    return name in ctx.client.setting._settings ? name : ''
  },
  set(value) {
    if (!(value in ctx.client.setting._settings)) value = ''
    router.replace('/settings/' + value)
  },
})

const items = computed(() => ctx.client.setting._settings[path.value] ?? [])

const tabs = computed<TabOption[]>(() => items.value.map((item, index) => ({
  id: String(index),
  label: item.title ?? `Section ${index + 1}`,
})))

const activeTab = ref('0')

const currentItems = computed(() => {
  if (items.value.length <= 1) return items.value
  const index = Number(activeTab.value) || 0
  return items.value.slice(index, index + 1)
})

</script>
