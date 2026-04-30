<template>
  <k-comment
    v-for="({ required, provider }, name) in env.using"
    :key="name"
    :type="provider ? 'success' : required ? 'warning' : 'primary'"
  >
    <p>
      {{ required ? '必需' : '可选' }}服务：{{ name }}
      <template v-if="provider">
        (<span
          v-if="provider.location && provider.location in ctx.manager.plugins.value.entries"
          class="k-link"
          @click="gotoProvider(provider.location)"
        >已加载</span>
        <span v-else>已加载</span>)
      </template>
      <template v-else>
        <span>(未加载</span>
        <template v-if="candidates(name).length">
          <span>，启用下列任一插件可实现此服务：</span>
        </template>
        <span>)</span>
      </template>
    </p>
    <ul v-if="!provider && candidates(name).length" class="dep-candidates">
      <li v-for="cand in candidates(name)" :key="cand">
        <span class="k-link" @click="openDetail(cand)">{{ cand }}</span>
      </li>
    </ul>
  </k-comment>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useContext, useRpc } from '@cordisjs/client'
import type { Data, SearchObject } from '../src'
import { activePackage } from './store'

const props = defineProps<{ env: any }>()

const ctx = useContext()
const router = useRouter()
const data = useRpc<Data>()

const marketObjects = computed<SearchObject[]>(() => {
  return Object.values(data.value?.market?.data ?? {})
})

const localPackages = computed(() => ctx.manager?.data?.value?.packages ?? {})

function candidates(serviceName: string): string[] {
  const seen = new Set<string>()
  // market entries
  for (const obj of marketObjects.value) {
    if (obj.manifest?.service?.implements?.includes(serviceName)) {
      seen.add(obj.package.name)
    }
  }
  // local (workspace) packages
  for (const [name, local] of Object.entries(localPackages.value) as Array<[string, any]>) {
    if (local.manifest?.service?.implements?.includes(serviceName)) {
      seen.add(name)
    }
  }
  return [...seen].sort()
}

function gotoProvider(location: string) {
  router.push('/plugins/' + location)
}

function openDetail(name: string) {
  activePackage.value = { name, bulkModeEnabled: true }
}

</script>

<style lang="scss" scoped>

.dep-candidates {
  margin: 4px 0 0;
  padding-left: 24px;

  li {
    margin: 2px 0;
  }
}

</style>
