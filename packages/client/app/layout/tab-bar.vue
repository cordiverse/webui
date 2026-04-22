<template>
  <div class="tab-bar">
    <div
      v-for="tab in tabs"
      :key="tab.id"
      class="tab-item"
      :class="{ active: tab.id === active }"
      @click="handleClick(tab)"
    >{{ tab.label }}</div>
    <slot></slot>
  </div>
</template>

<script lang="ts" setup>

import { useRouter } from 'vue-router'

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
