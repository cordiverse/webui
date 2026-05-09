<template>
  <el-dialog
    v-model="show"
    class="market-manual-dialog"
    title="手动添加依赖"
    destroy-on-close
    width="480px"
  >
    <k-comment type="warning">
      <p>如果你想要安装市场里已有的插件, 请回到插件市场页面进行操作。</p>
    </k-comment>

    <el-input
      ref="inputEl"
      v-model="name"
      placeholder="请输入 npm 包名"
      @keydown.enter.stop.prevent="onSubmit"
    />

    <div v-if="loading" class="manual-info muted">正在查询 npm……</div>
    <div v-else-if="notFound" class="manual-info danger">未找到此包。</div>
    <div v-else-if="info" class="manual-info">
      <div class="row"><span class="key">最新版本</span><span class="value">{{ info.latest }}</span></div>
      <div class="row" v-if="info.description">
        <span class="key">介绍</span>
        <span class="value">{{ info.description }}</span>
      </div>
    </div>

    <template #footer>
      <div class="footer-row">
        <span class="footer-spacer"/>
        <el-button @click="show = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!info"
          @click="onSubmit"
        >
          确定
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>

import { computed, inject, ref, watch, nextTick } from 'vue'
import { useRpc } from '@cordisjs/client'
import { useDebounceFn } from '@vueuse/core'
import { kShowManual } from './context'
import { storage } from './store'
import type { Data, DescribeResult } from '../src'

const show = inject(kShowManual)!
const inputEl = ref<any>()
const rpc = useRpc<Data>()

const name = ref('')
const info = ref<DescribeResult | null>(null)
const loading = ref(false)
const notFound = computed(() => !loading.value && !info.value && !!name.value.trim())

const fetchRemote = useDebounceFn(async (value: string) => {
  if (value !== name.value.trim()) return
  loading.value = true
  try {
    const data = await rpc.value!.describe(value)
    if (value === name.value.trim()) {
      info.value = data
    }
  } finally {
    if (value === name.value.trim()) loading.value = false
  }
}, 500)

watch(name, (value) => {
  info.value = null
  const trimmed = value.trim()
  if (!trimmed) {
    loading.value = false
    return
  }
  fetchRemote(trimmed)
})

watch(show, (v) => {
  if (v) {
    name.value = ''
    info.value = null
    nextTick(() => inputEl.value?.focus?.())
  }
})

function onSubmit() {
  if (!info.value) return
  storage.value.override = {
    ...storage.value.override,
    [info.value.name]: info.value.latest,
  }
  show.value = false
}

</script>

<style lang="scss" scoped>

.market-manual-dialog :deep(.el-dialog__header) {
  padding: 16px 20px 4px;
}

.market-manual-dialog :deep(.el-dialog__body) {
  padding: 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.market-manual-dialog :deep(.el-dialog__footer) {
  padding: 12px 20px 16px;
}

.manual-info {
  font-size: 13px;
  color: var(--text-secondary);

  &.muted { color: var(--text-tertiary); }
  &.danger { color: var(--error, #f87171); }

  .row {
    display: flex;
    gap: 12px;
    padding: 4px 0;

    .key {
      flex: 0 0 72px;
      color: var(--text-tertiary);
    }

    .value {
      color: var(--text-primary);
      word-break: break-word;
    }
  }
}

.footer-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.footer-spacer {
  flex: 1;
}

</style>
