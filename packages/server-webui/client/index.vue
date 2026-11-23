<template>
  <k-layout>
    <template #header>
      <span class="crumb">Server</span>
      <span class="self-url" v-if="data?.baseUrl">{{ data.baseUrl }}</span>
    </template>

    <template #menu>
      <span
        class="badge"
        :class="data?.listening ? 'badge-success' : 'badge-error'"
      >{{ data?.listening ? 'Listening' : 'Offline' }}</span>
    </template>

    <div class="content-area">
      <k-tab-bar :tabs="tabs" :active="active" @select="active = $event as typeof active" />
      <routes v-if="active === 'routes'" />
      <requests v-else />
    </div>
  </k-layout>
</template>

<script lang="ts" setup>

import { ref } from 'vue'
import { useRpc } from '@cordisjs/client'
import type { Data } from '../src'
import Routes from './routes.vue'
import Requests from './requests.vue'

const data = useRpc<Data>()

const tabs = [
  { id: 'routes', label: 'Routes' },
  { id: 'requests', label: 'Requests' },
]

const active = ref<'routes' | 'requests'>('routes')

</script>

<style lang="scss" scoped>

.self-url {
  font-size: 12px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-weight: 400;
  margin-left: 6px;
}

</style>
