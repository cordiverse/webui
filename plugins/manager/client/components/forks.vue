<template>
  <el-dialog
    :model-value="!!dialogFork"
    @update:model-value="dialogFork = undefined"
    class="dialog-config-fork"
    destroy-on-close>
    <template #header="{ titleId, titleClass }">
      <span :id="titleId" :class="titleClass">
        {{ dialogFork + (local?.workspace ? ' (工作区)' : '') }}
      </span>
    </template>
    <table>
      <tr v-for="id in plugins.forks[dialogFork!]" :key="id">
        <td class="text-left">
          <span class="status-light" :class="ctx.manager.getStatus(plugins.entries[id])"></span>
          <span class="path">{{ getFullPath(plugins.entries[id]) }}</span>
        </td>
        <td class="text-right">
          <span class="actions">
            <span class="action" @click.stop="configure(id)"><k-icon name="arrow-right"></k-icon></span>
            <span class="action" @click.stop="ctx.manager.remove(plugins.entries[id])"><k-icon name="delete"></k-icon></span>
          </span>
        </td>
      </tr>
    </table>
    <template #footer>
      <div class="left">
        <template v-if="plugins.forks[dialogFork!]?.length">
          此插件目前存在 {{ plugins.forks[dialogFork!]?.length }} 份配置。
        </template>
        <template v-else>
          此插件尚未被配置。
        </template>
      </div>
      <div class="right">
        <el-button @click.stop="configure()">添加新配置</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">

import { computed } from 'vue'
import { send, router, useContext } from '@cordisjs/client'
import { EntryData } from '../../src'

const ctx = useContext()
const plugins = computed(() => ctx.manager.plugins.value)
const dialogFork = computed({
  get: () => ctx.manager.dialogFork.value,
  set: (value) => ctx.manager.dialogFork.value = value,
})

const local = computed(() => ctx.manager.data.value.packages[dialogFork.value!])

function getLabel(data: EntryData) {
  return `${data.label ? `${data.label} ` : ''}[${data.id}]`
}

function getFullPath(data: EntryData) {
  const path = [getLabel(data)]
  while (data.parent) {
    data = ctx.manager.plugins.value.entries[data.parent]
    path.unshift(getLabel(data))
  }
  return path.join(' > ')
}

async function configure(id?: string) {
  if (!id) {
    id = await send('manager.config.create', {
      name: dialogFork.value!,
      disabled: true,
    })
  }
  await router.push('/plugins/' + id)
  dialogFork.value = undefined
}

</script>

<style lang="scss">

.dialog-config-fork {
  .el-dialog__header .el-dialog__title {
    font-weight: 500;
    color: var(--fg1);
    margin-right: 0.5rem;
    flex: 0 0 auto;
  }

  .status-light {
    margin-right: 0.75rem;
  }

  .actions {
    display: flex;
    gap: 0 0.5rem;
    align-items: center;
    justify-content: flex-end;
  }

  .action {
    display: inline-flex;
    width: 1.25rem;
    justify-content: center;
    cursor: pointer;
    color: var(--fg2);
    transition: var(--color-transition);

    &:hover {
      color: var(--fg1);
    }
  }

  .el-dialog__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.9em;
  }
}

</style>
