<template>
  <div class="action-wrapper" @click.prevent.stop>
    <button
      class="action-btn"
      :class="installed ? 'ghost' : 'primary'"
      @click="open"
    >
      {{ installed ? '管理' : '详情' }}
    </button>
  </div>
</template>

<script lang="ts" setup>

import { computed, inject } from 'vue'
import type { Dependency, SearchObject } from '../src'
import type { Dict } from 'cosmokit'
import { kActivePackage } from './context'

const props = defineProps<{
  data: SearchObject
  deps: Dict<Dependency>
  pending: Set<string>
}>()

const name = computed(() => props.data.package.name)
const installed = computed(() => Boolean(props.deps[name.value]))

const activeName = inject(kActivePackage)!

function open() {
  activeName.value = name.value
}

</script>

<style lang="scss" scoped>

.action-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  height: 28px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  transition: var(--color-transition);

  &.primary {
    background: var(--accent);
    color: white;
  }

  &.primary:hover {
    background: var(--accent-hover);
  }

  &.ghost {
    background: transparent;
    color: var(--text-secondary);
    border-color: var(--border-primary);
  }

  &.ghost:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}

</style>
