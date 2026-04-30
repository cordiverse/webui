<template>
  <k-layout>
    <template #header>
      <span class="crumb">依赖管理</span>
      <span class="crumb-sub" v-if="rows.length">
        共 {{ rows.length }} 项
        <template v-if="updatesCount">· {{ updatesCount }} 个可更新</template>
      </span>
    </template>

    <template #menu>
      <span
        v-if="pendingCount"
        class="menu-item apply-btn"
        @click="showConfirm = true"
        title="应用暂存的变更"
      >
        <span class="apply-text">应用</span>
        <span class="apply-count">{{ pendingCount }}</span>
      </span>
      <span
        class="menu-item"
        :class="{ disabled: !updatesCount }"
        @click="upgradeAll"
        title="将所有可更新的依赖加入暂存"
      >
        <k-icon class="menu-icon" name="arrow-up"/>
      </span>
      <span
        class="menu-item"
        @click="showManual = true"
        title="手动添加依赖"
      >
        <k-icon class="menu-icon" name="add"/>
      </span>
      <span
        class="menu-item refresh-btn"
        :class="{ spin: refreshing }"
        @click="refresh"
        title="刷新"
      >
        <k-icon class="menu-icon" name="refresh"/>
      </span>
    </template>

    <div class="deps-body">
      <table class="deps-table" v-if="rows.length">
        <colgroup>
          <col>
          <col width="140">
          <col width="220">
          <col width="180">
        </colgroup>
        <thead>
          <tr>
            <th>依赖</th>
            <th>本地版本</th>
            <th>目标版本</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.name">
            <td class="name">
              <span class="pkg">{{ row.name }}</span>
              <span v-if="row.workspace" class="badge workspace">工作区</span>
              <span v-if="row.invalid" class="badge danger">无效</span>
              <span v-if="row.missing" class="badge warning">未安装</span>
            </td>
            <td class="version">{{ row.resolved ?? '—' }}</td>
            <td>
              <el-select
                v-if="!row.workspace && row.versionKeys.length"
                size="small"
                :model-value="row.target ?? ''"
                @update:model-value="setVersion(row.name, $event)"
                class="target-select"
              >
                <el-option value="" label="不变更"/>
                <el-option value="__remove__" label="移除"/>
                <el-option
                  v-for="v in row.versionKeys"
                  :key="v"
                  :value="v"
                  :label="v + (v === row.resolved ? ' (当前)' : '')"
                />
              </el-select>
              <span v-else class="version muted">{{ row.workspace ? '工作区' : '—' }}</span>
            </td>
            <td class="actions">
              <button class="action-btn primary" @click="openDetail(row.name)">详情</button>
              <button
                v-if="row.target !== undefined"
                class="action-btn ghost"
                @click="clearVersion(row.name)"
              >
                取消
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <k-empty v-else>
        <p>未检测到任何依赖。</p>
      </k-empty>
    </div>
  </k-layout>
</template>

<script lang="ts" setup>

import { computed, provide, ref, watch } from 'vue'
import { send, useRpc } from '@cordisjs/client'
import type { Dict } from 'cosmokit'
import type { Data, RemotePackage, DependencyMetaKey } from '../src'
import { kActivePackage, kPackagesMap, kDependencies, kRefresh, kShowConfirm, kShowManual } from './context'
import { activePackage, showConfirm, showManual, storage } from './store'

const data = useRpc<Data>()

const market = computed(() => data.value?.market)
const deps = computed(() => data.value?.dependencies ?? {})
const packagesMap = computed(() => market.value?.data ?? {})

const refreshing = ref(false)

const pendingCount = computed(() => Object.keys(storage.value.override).length)

function requestRefresh() {
  send('market/refresh')
}

provide(kActivePackage, activePackage)
provide(kPackagesMap, packagesMap)
provide(kDependencies, deps)
provide(kRefresh, requestRefresh)
provide(kShowConfirm, showConfirm)
provide(kShowManual, showManual)

// Per-package registry cache (lazy fetch)
const registryCache = ref<Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>>>({})

async function ensureRegistry(names: string[]) {
  const missing = names.filter(n => !registryCache.value[n])
  if (!missing.length) return
  try {
    const result = await send('market/registry', missing)
    registryCache.value = { ...registryCache.value, ...result }
  } catch {}
}

interface Row {
  name: string
  resolved?: string
  request?: string
  workspace: boolean
  invalid: boolean
  missing: boolean
  target?: string
  versionKeys: string[]
}

const rowNames = computed(() => {
  const set = new Set<string>([
    ...Object.keys(deps.value),
    ...Object.keys(storage.value.override),
  ])
  return [...set].sort((a, b) => a.localeCompare(b))
})

// Lazily fetch registry for all rows so target version dropdown can work
watch(rowNames, (names) => {
  const scope = names.filter(n => !deps.value[n]?.workspace)
  ensureRegistry(scope)
}, { immediate: true })

const rows = computed<Row[]>(() => {
  return rowNames.value.map((name) => {
    const dep = deps.value[name]
    const override = storage.value.override[name]
    const versions = registryCache.value[name]
    const versionKeys = versions ? Object.keys(versions) : []
    const target = override === ''
      ? '__remove__'
      : override === undefined
        ? undefined
        : override
    return {
      name,
      resolved: dep?.resolved,
      request: dep?.request,
      workspace: !!dep?.workspace,
      invalid: !!dep?.invalid,
      missing: !!dep && !dep.resolved && !dep.workspace,
      target,
      versionKeys,
    }
  })
})

const updatesCount = computed(() => rows.value.filter(hasUpdate).length)

function hasUpdate(row: Row) {
  if (row.workspace || !row.versionKeys.length) return false
  const latest = row.versionKeys[0]
  if (!row.resolved) return false
  return row.resolved !== latest && !row.target
}

function setVersion(name: string, value: string) {
  const next = { ...storage.value.override }
  if (value === '') {
    delete next[name]
  } else if (value === '__remove__') {
    next[name] = ''
  } else {
    next[name] = value
  }
  storage.value.override = next
}

function clearVersion(name: string) {
  const { [name]: _, ...rest } = storage.value.override
  storage.value.override = rest
}

function upgradeAll() {
  if (!updatesCount.value) return
  const next = { ...storage.value.override }
  for (const row of rows.value) {
    if (!hasUpdate(row)) continue
    next[row.name] = row.versionKeys[0]
  }
  storage.value.override = next
}

function openDetail(name: string) {
  activePackage.value = { name, bulkModeEnabled: true }
}

async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await send('market/refresh')
  } finally {
    setTimeout(() => refreshing.value = false, 400)
  }
}

</script>

<style lang="scss" scoped>

.crumb-sub {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 400;
  margin-left: 6px;
}

.deps-body {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}

.deps-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th, td {
    text-align: left;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-secondary);
    vertical-align: middle;
  }

  th {
    color: var(--text-tertiary);
    font-weight: 500;
    font-size: 12px;
    background: var(--bg-secondary);
    position: sticky;
    top: 0;
    z-index: 1;
    border-bottom: 1px solid var(--border-primary);
  }

  td.name {
    .pkg {
      font-family: var(--font-mono, monospace);
      color: var(--text-primary);
    }

    .badge {
      margin-left: 6px;
      font-size: 10px;
      padding: 1px 6px;
      border-radius: var(--radius-sm);

      &.workspace {
        background: var(--accent-muted, var(--bg-tertiary));
        color: var(--accent);
      }

      &.warning {
        background: var(--warning-muted, rgba(250, 204, 21, 0.15));
        color: var(--warning, #facc15);
      }

      &.danger {
        background: var(--error-muted, rgba(248, 113, 113, 0.15));
        color: var(--error, #f87171);
      }
    }
  }

  td.version {
    color: var(--text-primary);

    &.muted { color: var(--text-tertiary); }
  }

  .target-select {
    width: 100%;
    max-width: 200px;
  }
}

.actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.action-btn {
  height: 26px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  transition: var(--color-transition);

  &.primary {
    background: var(--accent);
    color: white;

    &:hover { background: var(--accent-hover); }
  }

  &.ghost {
    background: transparent;
    color: var(--text-secondary);
    border-color: var(--border-primary);

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
  }
}

.apply-btn {
  width: auto !important;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent) !important;
  font-size: 12px;
  font-weight: 500;

  .apply-count {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--accent);
    color: #fff;
    font-size: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}

.refresh-btn.spin .menu-icon {
  animation: deps-spin 0.9s linear infinite;
}

@keyframes deps-spin {
  from { transform: rotate(0); }
  to   { transform: rotate(360deg); }
}

</style>
