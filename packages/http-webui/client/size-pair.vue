<template>
  <span class="size-pair">
    <span class="size-dir out" :title="`发送: ${bytesOut} B`">
      <span class="arrow">↑</span>
      <span class="value">{{ formatSize(bytesOut) }}</span>
    </span>
    <span class="size-dir in" :title="`接收: ${bytesIn} B`">
      <span class="arrow">↓</span>
      <span class="value">{{ formatSize(bytesIn) }}</span>
    </span>
  </span>
</template>

<script lang="ts" setup>

import { formatSize } from './utils'

defineProps<{
  bytesIn: number
  bytesOut: number
}>()

</script>

<style lang="scss" scoped>

.size-pair {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.size-dir {
  display: inline-flex;
  align-items: center;
  gap: 4px;

  &.out { color: var(--accent); }
  &.in  { color: var(--success); }
}

</style>
