<template>
  <div class="tab-bar">
    <div
      v-for="tab in tabs"
      :key="tab.id"
      class="tab-item"
      :class="{ active: tab.id === active }"
      @click="handleClick(tab)"
    ><span class="tab-label" :data-label="tab.label">{{ tab.label }}</span></div>
    <slot></slot>
  </div>
</template>

<script lang="ts" setup>

import { useRouter } from '@cordisjs/client'

export interface TabOption {
  id: string
  label: string
  to?: string
}

const props = defineProps<{
  tabs?: TabOption[]
  active?: string
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const router = useRouter()

function handleClick(tab: TabOption) {
  emit('select', tab.id)
  if (tab.to) router.replace(tab.to)
}

</script>
