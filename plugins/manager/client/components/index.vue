<template>
  <k-layout menu="config.tree" :menu-data="currentEntry">
    <template #header>
      <!-- root -->
      <template v-if="!currentEntry">插件配置</template>

      <!-- group -->
      <template v-else-if="currentEntry.isGroup">
        分组：{{ currentEntry.label || currentEntry.id }}
      </template>

      <!-- plugin -->
      <template v-else>
        {{ currentEntry.label || currentEntry.name }}
      </template>
    </template>

    <template #left>
      <tree-view ref="tree"></tree-view>
    </template>

    <k-empty v-if="!currentEntry">
      <div>请在左侧选择插件</div>
    </k-empty>
    <k-content v-else class="plugin-view" :key="path">
      <plugin-settings></plugin-settings>
    </k-content>
  </k-layout>
</template>

<script setup lang="ts">

import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useContext } from '@cordisjs/client'
import TreeView from './tree.vue'
import PluginSettings from './plugin.vue'

const route = useRoute()
const ctx = useContext()

const currentEntry = computed(() => ctx.manager.currentEntry)
const plugins = computed(() => ctx.manager.plugins.value)

const path = computed<string>(() => {
  if (!route.path.startsWith('/plugins/')) return ''
  if (typeof route.params.id !== 'string') return ''
  return route.params.id in plugins.value.entries ? route.params.id : ''
})

const tree = ref<InstanceType<typeof TreeView>>()

ctx.define('config.tree', currentEntry)

</script>

<style lang="scss">

.end {
  margin-right: 0.5rem;
}

.config-header {
  font-size: 1.375rem;
  margin: 0 0 2rem;
  line-height: 2rem;

  .k-button {
    float: right;
  }
}

.plugin-view .k-content > *:first-child {
  margin-top: 0;
}

</style>
