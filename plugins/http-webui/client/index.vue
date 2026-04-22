<template>
  <k-layout>
    <template #header>
      <span class="crumb">HTTP Client</span>
    </template>

    <div class="content-area">
      <k-tab-bar :tabs="tabs" :active="active" @select="active = $event as typeof active" />
      <compose v-show="active === 'compose'" />
      <history v-show="active === 'history'" />
    </div>
  </k-layout>
</template>

<script lang="ts" setup>

import { ref } from 'vue'
import Compose from './compose.vue'
import History from './history.vue'

const tabs = [
  { id: 'compose', label: 'Compose' },
  { id: 'history', label: 'History' },
]

const active = ref<'compose' | 'history'>('compose')

</script>
