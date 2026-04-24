<template>
  <div class="action-wrapper" @click.prevent.stop>
    <template v-if="installed">
      <button class="action-btn ghost" :disabled="busy" @click="onUninstall">
        <k-icon name="trash" v-if="!busy"/>
        <span>{{ busy ? '…' : 'Uninstall' }}</span>
      </button>
    </template>
    <template v-else-if="data.workspace">
      <span class="pill pill-muted">Workspace</span>
    </template>
    <template v-else>
      <button class="action-btn primary" :disabled="busy" @click="onInstall">
        <k-icon name="download" v-if="!busy"/>
        <span>{{ busy ? '…' : 'Install' }}</span>
      </button>
    </template>
  </div>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import { send } from '@cordisjs/client'
import type { SearchObject } from '@cordisjs/registry'
import type { Dependency } from '../src'
import type { Dict } from 'cosmokit'

const props = defineProps<{
  data: SearchObject
  deps: Dict<Dependency>
  pending: Set<string>
}>()

const name = computed(() => props.data.package.name)

const installed = computed(() => Boolean(props.deps[name.value]))
const busy = computed(() => props.pending.has(name.value))

async function onInstall() {
  if (busy.value) return
  props.pending.add(name.value)
  try {
    await send('market/install', { [name.value]: '^' + props.data.package.version })
  } finally {
    props.pending.delete(name.value)
  }
}

async function onUninstall() {
  if (busy.value) return
  props.pending.add(name.value)
  try {
    await send('market/install', { [name.value]: null })
  } finally {
    props.pending.delete(name.value)
  }
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
  padding: 0 10px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  transition: var(--color-transition);

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  :deep(.k-icon) {
    width: 12px;
    height: 12px;
  }

  &.primary {
    background: var(--accent);
    color: white;
  }

  &.primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  &.ghost {
    background: transparent;
    color: var(--text-secondary);
    border-color: var(--border-primary);
  }

  &.ghost:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 500;
}

.pill-muted {
  background: var(--bg-tertiary);
  color: var(--text-tertiary);
}

</style>
