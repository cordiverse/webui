<template>
  <el-dialog
    v-model="show"
    class="market-detail-dialog"
    destroy-on-close
    width="680px"
  >
    <template #header>
      <div class="detail-header">
        <span class="detail-name">{{ shortname }}</span>
        <span v-if="isWorkspace" class="workspace-tag">工作区</span>
        <el-select
          v-if="!isWorkspace && versionKeys.length"
          v-model="selectedVersion"
          size="small"
          class="version-select"
        >
          <el-option
            v-for="v in versionKeys"
            :key="v"
            :value="v"
            :label="v + (v === current ? ' (当前)' : '')"
          />
        </el-select>
      </div>
    </template>

    <template v-if="pkg">
      <p v-if="danger" class="banner danger">{{ danger }}</p>
      <p v-if="warning" class="banner warning">{{ warning }}</p>
      <p v-if="repairHint" class="banner danger">{{ repairHint }}</p>

      <p v-if="desc" class="desc">{{ desc }}</p>

      <div class="meta-grid">
        <div class="meta-row">
          <span class="meta-label">完整名</span>
          <span class="meta-value">{{ pkg.package.name }}</span>
        </div>
        <div class="meta-row" v-if="current">
          <span class="meta-label">当前版本</span>
          <span class="meta-value">{{ current }}{{ isWorkspace ? ' (工作区)' : '' }}</span>
        </div>
        <div class="meta-row" v-if="!isWorkspace && loadingVersions && !versionKeys.length">
          <span class="meta-label">版本</span>
          <span class="meta-value">正在加载……</span>
        </div>
      </div>

      <div v-if="peerDepsList.length" class="peers-section">
        <div class="peers-title">Peer 依赖</div>
        <table class="peers-table">
          <thead>
            <tr>
              <th>依赖</th>
              <th>版本区间</th>
              <th>当前 / 目标</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="peer in peerDepsList" :key="peer.name">
              <td class="name">{{ peer.name }}</td>
              <td>{{ peer.request }}</td>
              <td>
                <el-select
                  v-if="peer.canSelect"
                  size="small"
                  :model-value="peer.targetVersion"
                  @update:model-value="onPeerVersion(peer.name, $event)"
                  class="peer-select"
                >
                  <el-option value="" label="不变更"/>
                  <el-option
                    v-for="v in peer.versionKeys"
                    :key="v"
                    :value="v"
                    :label="v"
                  />
                </el-select>
                <template v-else>{{ peer.resolved ?? '—' }}{{ peer.isWorkspace ? ' (工作区)' : '' }}</template>
              </td>
              <td :class="['status', peer.status]">
                {{ peer.statusText }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <template v-else>
      <p class="loading-hint">加载中……</p>
    </template>

    <template #footer>
      <div class="footer-row">
        <el-checkbox v-model="bulkMode">批量操作模式</el-checkbox>
        <a
          v-if="homepage"
          :href="homepage"
          target="_blank"
          rel="noopener"
          class="homepage-link"
        >
          主页 →
        </a>
        <span class="footer-spacer"/>
        <el-button @click="show = false">取消</el-button>
        <el-button
          v-if="manager && isInstalled && !isWorkspace"
          @click="onConfigure"
        >
          {{ hasForks ? '配置' : '添加配置' }}
        </el-button>
        <template v-if="isWorkspace">
          <el-button v-if="isInstalled" type="danger" :loading="busy" @click="onRemove">移除</el-button>
          <el-button v-else type="primary" :loading="busy" @click="onAddWorkspace">添加</el-button>
        </template>
        <template v-else-if="versionKeys.length">
          <el-button v-if="showRemoveButton" type="danger" :loading="busy" @click="onUninstallClick">
            {{ bulkMode ? '等待卸载' : '卸载' }}
          </el-button>
          <el-button
            type="primary"
            :loading="busy"
            :disabled="!selectedVersion || unchanged"
            @click="onInstall"
          >
            {{ installButtonText }}
          </el-button>
        </template>
      </div>
    </template>
  </el-dialog>

  <el-dialog
    v-model="showRemoveConfigDialog"
    title="移除配置"
    width="440px"
    destroy-on-close
    append-to-body
  >
    <p class="remove-prompt">
      该插件存在 {{ forks.length }} 份配置, 是否一并删除？
    </p>
    <template #footer>
      <div class="footer-row">
        <span class="footer-spacer"/>
        <el-button @click="showRemoveConfigDialog = false">取消</el-button>
        <el-button @click="confirmUninstall(false)">仅卸载</el-button>
        <el-button type="danger" :loading="busy" @click="confirmUninstall(true)">同时删除配置</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>

import { computed, inject, ref, watch } from 'vue'
import { message, send, useInject } from '@cordisjs/client'
import { useI18nText } from '@cordisjs/components'
import { parse, satisfies } from 'semver'
import type { Dict } from 'cosmokit'
import type { RemotePackage, DependencyMetaKey } from '../src'
import { kActivePackage, kPackagesMap, kDependencies, kRefresh } from './context'
import { storage } from './store'

const show = ref(false)

const activeName = inject(kActivePackage)!
const packages = inject(kPackagesMap)!
const deps = inject(kDependencies)!
const requestRefresh = inject(kRefresh)!

const manager = useInject('manager')

const forks = computed(() => {
  if (!manager.value || !activeName.value) return []
  return manager.value.get(activeName.value) ?? []
})
const hasForks = computed(() => forks.value.length > 0)

const showRemoveConfigDialog = ref(false)
const pendingRemoveConfig = ref(false)

const bulkMode = computed({
  get: () => storage.value.bulkMode,
  set: (v) => { storage.value.bulkMode = v },
})

watch(activeName, (name) => {
  show.value = !!name
})
watch(show, (v) => {
  if (!v) activeName.value = ''
})

const pkg = computed(() => {
  if (!activeName.value) return undefined
  const market = packages.value[activeName.value]
  if (market) return market
  const dep = deps.value[activeName.value]
  if (!dep) return undefined
  return {
    package: { name: activeName.value, version: dep.resolved },
    shortname: activeName.value.replace(/(cordis-|^@cordisjs\/)plugin-/, ''),
  } as any
})
const shortname = computed(() => pkg.value?.shortname ?? activeName.value)
const current = computed(() => deps.value[activeName.value]?.resolved)
const isInstalled = computed(() => !!deps.value[activeName.value])
const isWorkspace = computed(() => !!deps.value[activeName.value]?.workspace)
const homepage = computed(() => pkg.value?.package.links?.homepage || pkg.value?.package.links?.repository)

const tt = useI18nText()
const desc = computed(() => pkg.value?.manifest?.description ? tt(pkg.value.manifest.description) : '')

// registryCache: package name → version → peer meta, populated lazily
const registryCache = ref<Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>>>({})
const loadingVersions = ref(false)
const selectedVersion = ref('')
const busy = ref(false)

const registryForActive = computed(() => registryCache.value[activeName.value] ?? {})
const versionKeys = computed(() => Object.keys(registryForActive.value))

async function ensureRegistry(names: string[]) {
  const missing = names.filter(n => !registryCache.value[n])
  if (!missing.length) return
  const result = await send('market/registry', missing)
  registryCache.value = { ...registryCache.value, ...result }
}

watch(activeName, async (name) => {
  selectedVersion.value = ''
  if (!name) return
  const dep = deps.value[name]
  if (dep?.workspace) return
  if (!registryCache.value[name]) {
    loadingVersions.value = true
    try {
      await ensureRegistry([name])
    } catch (err: any) {
      message({ message: `无法获取版本列表: ${err?.message ?? err}`, type: 'warning' })
    } finally {
      loadingVersions.value = false
    }
  }
  // pick default version
  const override = storage.value.override[name]
  if (override && registryForActive.value[override]) {
    selectedVersion.value = override
  } else if (dep?.request && registryForActive.value[dep.request]) {
    selectedVersion.value = dep.request
  } else {
    selectedVersion.value = versionKeys.value[0] ?? ''
  }
}, { immediate: true })

const unchanged = computed(() => {
  const dep = deps.value[activeName.value]
  if (bulkMode.value) {
    const current = storage.value.override[activeName.value]
    const noOverride = current === undefined
    if (noOverride) {
      return !!dep?.resolved && selectedVersion.value === dep.request
    }
    return current === selectedVersion.value
  }
  if (!dep?.resolved) return false
  return selectedVersion.value === dep.request
})

const showRemoveButton = computed(() => {
  if (bulkMode.value && storage.value.override[activeName.value] !== undefined) return true
  return !!current.value || !!deps.value[activeName.value]
})

const installButtonText = computed(() => {
  if (bulkMode.value) {
    const override = storage.value.override[activeName.value]
    if (override !== undefined && override !== '') return '等待更新'
    if (isInstalled.value) return '更新'
    return '等待安装'
  }
  if (isInstalled.value && !current.value) return '修复'
  return current.value ? '更新' : '安装'
})

const danger = computed(() => {
  if (isWorkspace.value) return ''
  const deprecated = registryForActive.value[selectedVersion.value]?.deprecated
  if (deprecated) return `此版本已废弃: ${deprecated}`
  if (pkg.value && (pkg.value as any).insecure) {
    return '警告: 此插件的最新版本检测出安全性问题, 安装可能导致严重问题。'
  }
  return ''
})

const warning = computed(() => {
  if (!selectedVersion.value || !current.value || isWorkspace.value) return ''
  try {
    const a = parse(current.value)
    const b = parse(selectedVersion.value)
    if (!a || !b) return ''
    if (a.major !== b.major || !a.major && a.minor !== b.minor) {
      return '提示: 你正在更改主版本号, 可能导致不兼容的行为。'
    }
  } catch {}
  return ''
})

const repairHint = computed(() => {
  if (!isInstalled.value || current.value || isWorkspace.value) return ''
  return '该依赖的安装发生了错误, 你可以尝试修复或移除它。'
})

// peer logic
interface PeerRow {
  name: string
  request: string
  resolved?: string
  isWorkspace: boolean
  canSelect: boolean
  versionKeys: string[]
  targetVersion: string
  status: 'success' | 'warning' | 'danger' | 'primary'
  statusText: string
}

function statusFor(request: string, resolved: string | undefined, isOptional: boolean, override: string | undefined): { status: PeerRow['status'], text: string } {
  const targetVersion = override ?? resolved
  if (override === '') return { status: 'primary', text: '等待移除' }
  if (!targetVersion) {
    if (isOptional) return { status: 'primary', text: '可选' }
    return { status: 'danger', text: '未安装' }
  }
  if (satisfies(targetVersion, request, { includePrerelease: true })) {
    if (override && override !== resolved) {
      return { status: 'success', text: resolved ? '等待更新' : '等待安装' }
    }
    return { status: 'success', text: '已满足' }
  }
  return { status: 'danger', text: '版本不匹配' }
}

const peerDepsList = computed<PeerRow[]>(() => {
  const version = selectedVersion.value
  const remote = registryForActive.value[version]
  if (!remote?.peerDependencies) return []
  const optional = remote.peerDependenciesMeta ?? {}
  const list: PeerRow[] = []
  for (const [name, request] of Object.entries(remote.peerDependencies)) {
    const dep = deps.value[name]
    const resolved = dep?.resolved
    const peerWorkspace = !!dep?.workspace
    const override = storage.value.override[name]
    const peerRegistry = registryCache.value[name]
    const versionKeys = peerRegistry ? Object.keys(peerRegistry) : []
    const canSelect = !peerWorkspace && versionKeys.length > 0
    const isOptional = !!optional[name]?.optional
    const { status, text } = statusFor(request, resolved, isOptional, override)
    list.push({
      name,
      request,
      resolved,
      isWorkspace: peerWorkspace,
      canSelect,
      versionKeys,
      targetVersion: override ?? '',
      status,
      statusText: text,
    })
  }
  return list
})

// lazily fetch registry for peers that need selection
watch(peerDepsList, async (peers) => {
  const missing = peers
    .filter(p => !p.isWorkspace)
    .map(p => p.name)
    .filter(name => !registryCache.value[name])
  if (!missing.length) return
  try {
    await ensureRegistry(missing)
  } catch {}
})

function onPeerVersion(name: string, version: string) {
  if (version) {
    storage.value.override = { ...storage.value.override, [name]: version }
  } else {
    const { [name]: _, ...rest } = storage.value.override
    storage.value.override = rest
  }
}

function onUninstallClick() {
  if (bulkMode.value) {
    setOverride(activeName.value, '')
    show.value = false
    return
  }
  if (manager.value && hasForks.value) {
    showRemoveConfigDialog.value = true
    return
  }
  runUninstall(false)
}

async function confirmUninstall(removeConfig: boolean) {
  showRemoveConfigDialog.value = false
  pendingRemoveConfig.value = removeConfig
  await runUninstall(removeConfig)
}

async function runUninstall(removeConfig: boolean) {
  const name = activeName.value
  const code = await runInstallRaw({ [name]: null })
  if (code !== 0) return
  if (removeConfig && manager.value) {
    try {
      await manager.value.remove(name)
    } catch (err: any) {
      message({ message: `配置删除失败: ${err?.message ?? err}`, type: 'warning' })
    }
  }
}

async function runInstallRaw(payload: Dict<string | null>): Promise<number> {
  if (busy.value) return 1
  busy.value = true
  try {
    const code = await send('market/install', payload)
    if (code) {
      message({ message: '安装失败, 请查看控制台日志', type: 'error' })
    } else {
      message({ message: '操作成功', type: 'success' })
      show.value = false
      requestRefresh()
    }
    return code
  } catch (err: any) {
    message({ message: `失败: ${err?.message ?? err}`, type: 'error' })
    return 1
  } finally {
    busy.value = false
  }
}

async function runInstall(payload: Dict<string | null>) {
  await runInstallRaw(payload)
}

async function onConfigure() {
  if (!manager.value) return
  await manager.value.ensure(activeName.value)
  show.value = false
}

function setOverride(name: string, value: string | undefined) {
  const next = { ...storage.value.override }
  if (value === undefined) {
    delete next[name]
  } else {
    next[name] = value
  }
  storage.value.override = next
}

function onInstall() {
  if (!selectedVersion.value) return
  const name = activeName.value
  if (bulkMode.value) {
    // if selected matches current, clear override; else set to version
    const dep = deps.value[name]
    if (dep?.resolved === selectedVersion.value) {
      setOverride(name, undefined)
    } else {
      setOverride(name, selectedVersion.value)
    }
    show.value = false
    return
  }
  runInstall({ [name]: '^' + selectedVersion.value })
}

function onRemove() {
  runInstall({ [activeName.value]: null })
}

function onAddWorkspace() {
  const version = pkg.value?.package.version ?? '*'
  runInstall({ [activeName.value]: version })
}

</script>

<style lang="scss" scoped>

.market-detail-dialog :deep(.el-dialog__header) {
  padding: 16px 20px 4px;
  margin-right: 0;
}

.market-detail-dialog :deep(.el-dialog__body) {
  padding: 8px 20px 0;
}

.market-detail-dialog :deep(.el-dialog__footer) {
  padding: 12px 20px 16px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.detail-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.workspace-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--accent-muted, var(--bg-tertiary));
  color: var(--accent);
}

.version-select {
  width: 200px;
  margin-left: auto;
}

.banner {
  margin: 8px 0;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  font-size: 12px;

  &.danger {
    background: var(--error-muted, rgba(248, 113, 113, 0.1));
    color: var(--error, #f87171);
  }

  &.warning {
    background: var(--warning-muted, rgba(250, 204, 21, 0.1));
    color: var(--warning, #facc15);
  }
}

.desc {
  margin: 8px 0 12px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.meta-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  margin-bottom: 16px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
}

.meta-label {
  flex: 0 0 72px;
  color: var(--text-tertiary);
}

.meta-value {
  color: var(--text-primary);
  word-break: break-all;
}

.peers-section {
  margin-top: 8px;
}

.peers-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.peers-table {
  width: 100%;
  font-size: 12px;
  border-collapse: collapse;

  th, td {
    text-align: left;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-secondary);
    vertical-align: middle;
  }

  th {
    color: var(--text-tertiary);
    font-weight: 500;
  }

  td.name {
    font-family: var(--font-mono, monospace);
  }

  td.status {
    font-weight: 500;

    &.success { color: var(--success, #4ade80); }
    &.warning { color: var(--warning, #facc15); }
    &.danger  { color: var(--error,   #f87171); }
    &.primary { color: var(--text-secondary); }
  }

  .peer-select {
    width: 160px;
  }
}

.loading-hint {
  text-align: center;
  color: var(--text-tertiary);
  padding: 24px 0;
}

.footer-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.homepage-link {
  color: var(--accent);
  font-size: 12px;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}

.footer-spacer {
  flex: 1;
}

.remove-prompt {
  margin: 0;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.6;
}

</style>
