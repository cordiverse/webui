<template>
  <el-dialog
    v-model="show"
    class="market-confirm-dialog"
    title="确认安装"
    destroy-on-close
    width="540px"
  >
    <p v-if="!entries.length" class="empty">当前没有待提交的变更。</p>
    <table v-else class="diff-table">
      <colgroup>
        <col width="auto">
        <col width="120">
        <col width="40">
        <col width="140">
      </colgroup>
      <thead>
        <tr>
          <th>依赖</th>
          <th>旧版本</th>
          <th></th>
          <th>新版本</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="[name, version] in entries" :key="name">
          <td class="name">{{ name }}</td>
          <td>{{ deps[name]?.resolved || '未安装' }}</td>
          <td class="arrow">→</td>
          <td :class="['target', version === '' && 'remove']">
            {{ version || '移除' }}
          </td>
        </tr>
      </tbody>
    </table>
    <template #footer>
      <el-checkbox
        v-model="removeConfig"
        :disabled="!hasRemove || !manager"
        class="footer-checkbox"
      >
        为新卸载的依赖删除配置
      </el-checkbox>
      <el-button type="danger" plain @click="clearAll" :disabled="!entries.length">
        丢弃改动
      </el-button>
      <el-button
        type="primary"
        :loading="busy"
        :disabled="!entries.length"
        @click="apply"
      >
        确认安装
      </el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>

import { computed, inject, ref, watch } from 'vue'
import { message, useInject, useRpc } from '@cordisjs/client'
import type { Dict } from 'cosmokit'
import { kDependencies, kRefresh, kShowConfirm } from './context'
import { storage } from './store'
import type { Data } from '../src'

const show = inject(kShowConfirm)!
const deps = inject(kDependencies)!
const requestRefresh = inject(kRefresh)!
const manager = useInject('manager')
const rpc = useRpc<Data>()

const busy = ref(false)

const entries = computed(() => Object.entries(storage.value.override))
const hasRemove = computed(() => entries.value.some(([, v]) => v === ''))

const removeConfig = ref(storage.value.removeConfig === true)
watch(show, (v) => {
  if (v) removeConfig.value = storage.value.removeConfig === true
})

function clearAll() {
  storage.value.override = {}
  show.value = false
}

async function apply() {
  if (!entries.value.length) return
  busy.value = true
  const payload: Dict<string | null> = {}
  // capture which packages are newly added (not yet installed)
  const newlyInstalled: string[] = []
  const removals: string[] = []
  for (const [name, version] of entries.value) {
    payload[name] = version === '' ? null : '^' + version
    if (version !== '' && !deps.value[name]?.resolved) {
      newlyInstalled.push(name)
    } else if (version === '') {
      removals.push(name)
    }
  }
  try {
    const code = await rpc.value!.install(payload)
    if (code) {
      message({ message: '安装失败, 请查看控制台日志', type: 'error' })
      return
    }
    if (manager.value) {
      // ensure config nodes for newly installed packages
      for (const name of newlyInstalled) {
        try {
          await manager.value.ensure(name, true)
        } catch (err) {
          console.warn('ensure config for', name, err)
        }
      }
      // optionally remove config for newly removed packages
      if (removeConfig.value) {
        for (const name of removals) {
          try {
            await manager.value.remove(name)
          } catch (err) {
            console.warn('remove config for', name, err)
          }
        }
      }
    }
    message({ message: '应用完成', type: 'success' })
    storage.value.override = {}
    show.value = false
    requestRefresh()
  } catch (err: any) {
    message({ message: `失败: ${err?.message ?? err}`, type: 'error' })
  } finally {
    busy.value = false
  }
}

</script>

<style lang="scss" scoped>

.market-confirm-dialog :deep(.el-dialog__header) {
  padding: 16px 20px 4px;
  margin-right: 0;
}

.market-confirm-dialog :deep(.el-dialog__body) {
  padding: 12px 20px;
}

.market-confirm-dialog :deep(.el-dialog__footer) {
  padding: 12px 20px 16px;
}

.empty {
  color: var(--text-tertiary);
  text-align: center;
  padding: 16px 0;
}

.diff-table {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;

  th, td {
    text-align: left;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-secondary);
  }

  th {
    color: var(--text-tertiary);
    font-weight: 500;
  }

  td.name {
    font-family: var(--font-mono, monospace);
  }

  td.arrow {
    color: var(--text-tertiary);
    text-align: center;
  }

  td.target.remove {
    color: var(--error, #f87171);
  }

  td.target:not(.remove) {
    color: var(--success, #4ade80);
  }
}

.footer-checkbox {
  margin-right: auto;
}

</style>
