<template>
  <div class="table-view">
    <div class="table-toolbar">
      <div class="toolbar-info">
        <span class="meta-label">表</span>
        <span class="meta-value mono">{{ tab.table }}</span>
        <span class="meta-sep">·</span>
        <span class="meta-label">总行数</span>
        <span class="meta-value">{{ totalDisplay }}</span>
        <span v-if="tab.sort" class="meta-sep">·</span>
        <span v-if="tab.sort" class="meta-label">排序</span>
        <span v-if="tab.sort" class="meta-value mono">{{ tab.sort.field }} {{ tab.sort.direction }}</span>
      </div>
      <div class="toolbar-spacer"></div>
      <button class="toolbar-btn" :disabled="loading" @click="reload" title="刷新">
        <k-icon name="refresh"/>
      </button>
      <select class="page-size-select" :value="tab.pageSize" @change="onPageSize($event)">
        <option v-for="n of [25, 50, 100, 200]" :key="n" :value="n">{{ n }} / 页</option>
      </select>
    </div>

    <div v-if="!info" class="table-empty">表 {{ tab.table }} 已不存在</div>
    <div v-else-if="error" class="table-error">{{ error }}</div>
    <div v-else class="table-scroll">
      <table class="data-grid">
        <thead>
          <tr>
            <th
              v-for="field of info.fields"
              :key="field.name"
              :class="{ sortable: true, active: tab.sort?.field === field.name }"
              @click="onHeaderClick(field.name)"
            >
              <field-type :type="field.type"/>
              <span class="header-name">{{ field.name }}</span>
              <span class="header-sort" v-if="tab.sort?.field === field.name">
                {{ tab.sort.direction === 'asc' ? '▲' : '▼' }}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) of rows" :key="rowKey(row, idx)">
            <td v-for="field of info.fields" :key="field.name" :title="renderCell(row[field.name])">
              <span class="cell" :class="cellClass(row[field.name])">{{ renderCell(row[field.name]) }}</span>
            </td>
          </tr>
          <tr v-if="!rows.length && !loading">
            <td :colspan="info.fields.length" class="grid-empty">空表</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="table-loading">加载中…</div>
    </div>

    <div class="pagination" v-if="info">
      <button class="pg-btn" :disabled="tab.page <= 1 || loading" @click="setPage(1)">«</button>
      <button class="pg-btn" :disabled="tab.page <= 1 || loading" @click="setPage(tab.page - 1)">‹</button>
      <span class="pg-info">第 {{ tab.page }} / {{ totalPages }} 页</span>
      <button class="pg-btn" :disabled="tab.page >= totalPages || loading" @click="setPage(tab.page + 1)">›</button>
      <button class="pg-btn" :disabled="tab.page >= totalPages || loading" @click="setPage(totalPages)">»</button>
    </div>
  </div>
</template>

<script lang="ts" setup>

import { computed, ref, watch } from 'vue'
import { send } from '@cordisjs/client'
import FieldType from './field-type.vue'
import type { TableInfo, QueryResult } from '../src'
import type { TableTab } from './state'
import { cacheKey, rowCache } from './state'

const props = defineProps<{
  tab: TableTab
  info?: TableInfo
}>()

const loading = ref(false)
const error = ref('')
const total = ref(props.info?.count ?? 0)

const rows = computed(() => {
  const key = cacheKey(props.tab)
  return rowCache.get(key)?.rows ?? []
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / Math.max(1, props.tab.pageSize))))

const totalDisplay = computed(() => total.value.toLocaleString())

async function load() {
  if (!props.info) return
  const key = cacheKey(props.tab)
  const cached = rowCache.get(key)
  if (cached) {
    total.value = cached.total
    return
  }
  loading.value = true
  error.value = ''
  try {
    const result: QueryResult = await send('database-webui.query', {
      table: props.tab.table,
      limit: props.tab.pageSize,
      offset: (props.tab.page - 1) * props.tab.pageSize,
      sort: props.tab.sort,
    })
    rowCache.set(key, result)
    total.value = result.total
  } catch (e: any) {
    error.value = String(e?.message ?? e)
  } finally {
    loading.value = false
  }
}

watch(() => cacheKey(props.tab), () => load(), { immediate: true })

watch(() => props.info?.count, (n) => {
  if (typeof n === 'number') total.value = n
})

function reload() {
  rowCache.delete(cacheKey(props.tab))
  load()
}

function setPage(n: number) {
  const next = Math.max(1, Math.min(n, totalPages.value))
  if (next === props.tab.page) return
  props.tab.page = next
}

function onPageSize(event: Event) {
  const value = parseInt((event.target as HTMLSelectElement).value, 10)
  if (!Number.isFinite(value)) return
  props.tab.pageSize = value
  props.tab.page = 1
}

function onHeaderClick(field: string) {
  const cur = props.tab.sort
  if (cur?.field === field) {
    if (cur.direction === 'asc') {
      props.tab.sort = { field, direction: 'desc' }
    } else {
      props.tab.sort = undefined
    }
  } else {
    props.tab.sort = { field, direction: 'asc' }
  }
  props.tab.page = 1
}

function renderCell(value: any): string {
  if (value === null) return '∅'
  if (value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function cellClass(value: any) {
  if (value === null) return 'null'
  if (value === undefined) return 'undef'
  if (typeof value === 'object') return 'json'
  if (typeof value === 'number') return 'num'
  if (typeof value === 'boolean') return 'bool'
  return ''
}

</script>

<style lang="scss" scoped>

.table-view {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.table-toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-secondary);
  font-size: 12px;
}

.toolbar-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.toolbar-spacer { flex: 1 1 auto; }

.meta-label { color: var(--text-tertiary); }
.meta-value { color: var(--text-primary); }
.meta-value.mono { font-family: var(--font-mono); }
.meta-sep { color: var(--text-tertiary); padding: 0 2px; }

.toolbar-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-primary);
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  :deep(.k-icon) { width: 13px; height: 13px; }
}

.page-size-select {
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--border-primary);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-radius: var(--radius-sm);
  font-size: 12px;
}

.table-scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
  position: relative;
}

.data-grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    text-align: left;
    padding: 8px 12px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-primary);
    color: var(--text-secondary);
    user-select: none;
    white-space: nowrap;

    > * + * { margin-left: 6px; }

    &.sortable {
      cursor: pointer;

      &:hover { background: var(--bg-hover); }
    }

    &.active {
      color: var(--accent);
    }
  }

  .header-name {
    font-family: var(--font-mono);
    font-weight: 600;
  }

  .header-sort {
    font-size: 10px;
  }

  tbody td {
    padding: 6px 12px;
    border-bottom: 1px solid var(--border-secondary);
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: middle;
  }

  tbody tr:hover td {
    background: var(--bg-hover);
  }

  .cell {
    font-family: var(--font-mono);
    color: var(--text-primary);

    &.null,
    &.undef {
      color: var(--text-tertiary);
      font-style: italic;
    }

    &.num { color: var(--accent); }
    &.bool { color: var(--success); }
    &.json { color: var(--warning); }
  }

  .grid-empty {
    text-align: center;
    padding: 32px;
    color: var(--text-tertiary);
  }
}

.table-loading {
  position: absolute;
  top: 36px;
  right: 16px;
  padding: 4px 10px;
  font-size: 11px;
  background: var(--bg-elevated, var(--bg-secondary));
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
}

.table-empty,
.table-error {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

.table-error { color: var(--error); }

.pagination {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid var(--border-secondary);
  font-size: 12px;
}

.pg-btn {
  width: 26px;
  height: 26px;
  border: 1px solid var(--border-primary);
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.pg-info {
  padding: 0 8px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
}

</style>
