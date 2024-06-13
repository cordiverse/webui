<template>
  <k-layout menu="config.tree" :menu-data="currentEntry">
    <template #header>
      <template v-if="!currentEntry">插件管理</template>

      <template v-else>
        <span class="label">
          {{ ctx.manager.getLabel(currentEntry) }}
        </span>
        <span class="divider"></span>
        <el-popover popper-class="k-menu" v-model:visible="visible">
          <template #reference>
            <span class="flex items-center cursor-pointer h-full">
              <span>{{ currentRoute!.title }}</span>
              <svg class="h-4 ml-2 transition" :class="{ 'rotate-90': visible }" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
                <path fill="currentColor" d="M384 192v640l384-320.064z"></path>
              </svg>
            </span>
          </template>
          <template v-for="route in ctx.manager.getRoutes(currentEntry)">
            <div
              class="k-menu-item"
              :class="[{ active: route.path === currentRoute!.path }, route.indent ? 'pl-8' : 'pl-4']"
              @click="gotoRoute(route)"
            >
              <!-- <span class="absolute left-3 top-0 bottom-0 flex items-center" v-if="route.path === currentRoute!.path">
                <span class="w-6px h-6px rounded bg-current"></span>
              </span> -->
              <span>{{ route.label }}</span>
            </div>
          </template>
        </el-popover>
      </template>
    </template>

    <template #left>
      <tree-view ref="tree"></tree-view>
    </template>

    <k-empty v-if="!currentEntry">
      <div>请在左侧选择插件</div>
    </k-empty>
    <template v-else-if="currentEntry.name in ctx.manager.data.value.packages">
      <k-content v-if="!local.runtime">
        <h1>{{ currentEntry.name }}</h1>
        <k-comment>
          <p>正在加载插件信息……</p>
        </k-comment>
      </k-content>
      <k-content v-else-if="local.runtime.failed">
        <h1>{{ currentEntry.name }}</h1>
        <k-comment type="danger">
          <p>插件信息失败，这可能是插件本身的问题所致。</p>
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
  </k-layout>
</template>

<script setup lang="ts">

import { computed, ref, watch } from 'vue'
import { useContext, router, send } from '@cordisjs/client'
import TreeView from './tree.vue'
import type { SubRoute } from '..'

const ctx = useContext()

const currentEntry = computed(() => ctx.manager.currentEntry)
const currentRoute = computed(() => ctx.manager.currentRoute)
const local = computed(() => ctx.manager.data.value.packages[ctx.manager.currentEntry?.name!])

const visible = ref(false)
const tree = ref<InstanceType<typeof TreeView>>()

ctx.define('config.tree', currentEntry)

watch(local, (value) => {
  if (!value || value.runtime) return
  send('manager.package.runtime', { name: value.package.name })
}, { immediate: true })

function gotoRoute(route: SubRoute) {
  router.replace('/plugins/' + currentEntry.value!.id + '/' + route.path)
}

</script>

<style lang="scss" scoped>

.divider {
  position: relative;
  display: inline-block;
  height: 100%;
  width: 20px;
  margin: 0 0.75rem;
  overflow: hidden;

  &::before, &::after {
    content: '';
    display: block;
    position: absolute;
    left: 0;
    width: 100%;
    height: 50%;
    border-right: 1px solid var(--k-color-divider);
  }

  &::before {
    top: 0;
    transform: skewX(30deg) translateX(-50%);
  }

  &::after {
    bottom: 0;
    transform: skewX(-30deg) translateX(-50%);
  }
}

svg.rotate-90 {
  transform: rotate(90deg);
}

.k-menu-item.active {
  color: var(--primary);
}

</style>
