<template>
  <k-layout>
    <template #header>
      <span class="crumb">Plugin Market</span>
      <span class="crumb-sub">
        {{ filterActive ? `找到 ${filteredCount} 个匹配` : market?.total ? `共 ${market.total} 个插件` : '' }}
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
        class="menu-item refresh-btn"
        :class="{ spin: market?.loading, 'just-refreshed': justRefreshed }"
        @click="refresh"
        :title="justRefreshed ? '已刷新' : 'Refresh'"
      >
        <k-icon v-if="justRefreshed" class="menu-icon check" name="check-full"/>
        <k-icon v-else class="menu-icon" name="refresh"/>
      </span>
    </template>

    <aside class="page-sidebar market-sidebar">
      <market-filter v-model="words" :data="packages"/>
    </aside>

    <div class="content-area">
      <div
        class="market-search-bar"
        :class="{ focused }"
        @click="focusInput"
      >
        <k-icon class="search-icon" name="search"/>
        <market-search
          ref="searchRef"
          v-model="words"
          class="market-search-inline"
        />
      </div>
      <div ref="bodyRef" class="market-body">
        <k-comment v-if="market?.error && !packageCount" type="danger">
          <p>无法连接到插件市场:{{ market.error }}</p>
          <p>请检查 endpoint 配置或网络。</p>
        </k-comment>

        <k-card v-if="market?.loading && !packageCount" class="loading">
          正在加载市场数据……
        </k-card>

        <market-list
          ref="listRef"
          v-if="packageCount"
          v-model="words"
          v-model:page="currentPage"
          :data="packages"
          :installed="isInstalled"
          #action="data"
        >
          <action-button :data="data" :deps="deps" :pending="pending"/>
        </market-list>
      </div>
      <div v-if="totalPages > 1" class="market-footer">
        <el-pagination
          background
          v-model:current-page="currentPage"
          :pager-count="5"
          :page-size="listLimit"
          :total="listTotal"
          layout="prev, pager, next"
        />
      </div>
    </div>

    <detail-dialog/>
    <confirm-dialog/>
    <manual-dialog/>
  </k-layout>
</template>

<script lang="ts" setup>

import { computed, provide, ref, watch, nextTick } from 'vue'
import { message, send, useRpc } from '@cordisjs/client'
import { MarketSearch, MarketFilter, MarketList, getFiltered, hasFilter, kConfig } from '@cordisjs/market'
import type { Data } from '../src'
import ActionButton from './action.vue'
import DetailDialog from './detail.vue'
import ConfirmDialog from './confirm.vue'
import ManualDialog from './manual.vue'
import { kActivePackage, kPackagesMap, kDependencies, kRefresh, kShowConfirm, kShowManual } from './context'
import { activePackage, showConfirm, showManual, storage } from './store'

const data = useRpc<Data>()

const market = computed(() => data.value?.market)
const deps = computed(() => data.value?.dependencies ?? {})
const packages = computed(() => Object.values(market.value?.data ?? {}))
const packagesMap = computed(() => market.value?.data ?? {})
const packageCount = computed(() => packages.value.length)

const words = ref<string[]>([''])
const pending = ref(new Set<string>())

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

const filterActive = computed(() => hasFilter(words.value))
const filteredCount = computed(() => filterActive.value ? getFiltered(packages.value, words.value).length : 0)

const searchRef = ref<InstanceType<typeof MarketSearch>>()
const bodyRef = ref<HTMLElement>()
const listRef = ref<InstanceType<typeof MarketList>>()
const focused = ref(false)
const justRefreshed = ref(false)
const userTriggered = ref(false)

const currentPage = ref(1)
const listTotal = computed(() => listRef.value?.total ?? 0)
const listLimit = computed(() => listRef.value?.limit ?? 24)
const totalPages = computed(() => Math.ceil(listTotal.value / Math.max(listLimit.value, 1)))

watch(currentPage, () => {
  bodyRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
})

function isInstalled(data: any) {
  return Boolean(deps.value[data.package.name])
}

provide(kConfig, {
  installed: isInstalled,
})

function focusInput(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('.search-word') || target.closest('input')) return
  const input = (searchRef.value?.$el as HTMLElement)?.querySelector('input')
  input?.focus()
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined
watch(() => market.value?.loading, (loading, prev) => {
  if (prev && !loading && userTriggered.value) {
    userTriggered.value = false
    if (!market.value?.error) {
      justRefreshed.value = true
      message({ message: '市场已刷新', type: 'success', duration: 1500 })
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        justRefreshed.value = false
      }, 1500)
    }
  }
})

function refresh() {
  if (market.value?.loading) return
  userTriggered.value = true
  justRefreshed.value = false
  send('market/refresh')
}

function setupFocusTracking() {
  const root = searchRef.value?.$el as HTMLElement | undefined
  const input = root?.querySelector('input')
  if (!input) return
  input.addEventListener('focus', () => focused.value = true)
  input.addEventListener('blur', () => focused.value = false)
}
nextTick(setupFocusTracking)

</script>

<style lang="scss" scoped>

.crumb-sub {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 400;
  margin-left: 6px;
}

.market-sidebar {
  padding: 16px 20px;
  overflow-y: auto;
}

.market-search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--header-height);
  min-height: var(--header-height);
  padding: 0 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  cursor: text;
  transition: background-color 0.15s ease;

  &.focused {
    background-color: var(--bg-elevated, var(--bg-hover));
  }

  .search-icon {
    width: 14px;
    height: 14px;
    color: var(--text-tertiary);
    flex-shrink: 0;
  }
}

.market-search-inline {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  margin: 0 !important;
  max-width: none !important;
  border-radius: 0 !important;
  background: none !important;

  :deep(.search-container) {
    flex: 1 1 0;
    padding: 0 !important;
    min-height: 0;
    gap: 6px;
  }

  :deep(.search-container input) {
    flex: 1 1 0;
    min-width: 0;
    height: 1.5rem;
    line-height: 1.5rem;
    padding: 0;
    font-size: 13px;
    color: var(--text-primary);
  }

  :deep(.search-container input::placeholder) {
    color: var(--text-tertiary);
  }

  :deep(.search-action) {
    display: none;
  }

  :deep(.search-word) {
    background-color: var(--accent);
    color: var(--text-inverse, #fff);
    height: auto;
    line-height: 1.2;
    padding: 2px 8px;
    font-size: 12px;
  }
}

.market-body {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding: 2rem 2rem;
}

.market-footer {
  flex: 0 0 auto;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 10px 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-primary);
}

.loading {
  text-align: center;
  padding: 24px;
  color: var(--text-tertiary);
}

.refresh-btn {
  .menu-icon {
    transition: transform 0.4s ease, opacity 0.2s ease;
  }

  &.just-refreshed .menu-icon.check {
    color: var(--success, #4ade80);
    animation: market-pop 0.4s ease;
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

@keyframes market-pop {
  0%   { transform: scale(0.6); opacity: 0; }
  50%  { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

</style>
