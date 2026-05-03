<template>
  <div class="user-page">
    <div class="user-card">
      <div class="user-head">
        <div class="user-info">
          <div class="user-name">{{ store.user?.name ?? `用户 #${store.user?.id}` }}</div>
          <div class="user-meta">ID {{ store.user?.id }} · 注册于 {{ formatDate(store.user?.createdAt ?? '') }}</div>
        </div>
        <el-button @click="onLogout">登出</el-button>
      </div>
    </div>

    <div class="user-card">
      <div class="card-title">已绑定登录方式</div>
      <div v-if="loading" class="hint">加载中…</div>
      <div v-else-if="!identities.length" class="hint">没有已绑定的登录方式</div>
      <ul v-else class="identity-list">
        <li v-for="ident in identities" :key="ident.id" class="identity-item">
          <div class="identity-info">
            <div class="identity-provider">{{ ident.provider }}</div>
            <div class="identity-time">{{ formatDate(ident.createdAt) }}</div>
          </div>
          <el-button
            size="small"
            type="danger"
            text
            :disabled="identities.length <= 1"
            @click="onUnlink(ident.id, ident.provider)"
          >解绑</el-button>
        </li>
      </ul>
    </div>

    <!--
      新增登录方式 (修改密码 / 绑定邮箱 / 绑定 OAuth) 需要 sso-server 提供
      额外的"已登录用户为现有 user 注册新 provider 凭据"端点 — 当前 sso-server
      的 POST /sso/link/:provider 只创建空 identity 行,不调用 provider.register。
      v1 暂不开放,等 sso-server 补齐 link-with-credentials 流程后再加。
    -->
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listIdentities,
  unlink as doUnlink,
  logout as doLogout,
  store,
  SsoError,
} from './store'
import type { Identity } from '../shared'

const identities = ref<Identity[]>([])
const loading = ref(false)

async function refreshIdentities() {
  loading.value = true
  try {
    identities.value = await listIdentities()
  } catch {
    identities.value = []
  } finally {
    loading.value = false
  }
}

onMounted(refreshIdentities)

async function onUnlink(id: number, provider: string) {
  if (identities.value.length <= 1) {
    ElMessage.warning('至少要保留一种登录方式')
    return
  }
  try {
    await ElMessageBox.confirm(`确认解绑 ${provider} 登录方式?`, '解绑', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await doUnlink(id)
    ElMessage.success('已解绑')
    await refreshIdentities()
  } catch (e) {
    const code = e instanceof SsoError ? e.code : 'unknown'
    ElMessage.error(`解绑失败: ${code}`)
  }
}

async function onLogout() {
  await doLogout()
  ElMessage.success('已登出')
}

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleString()
  } catch {
    return s
  }
}
</script>

<style lang="scss" scoped>
.user-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
  flex: 1;
}
.user-card {
  background: var(--bg-elevated, var(--bg-secondary));
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg, 8px);
  padding: 20px;
}
.user-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.user-name {
  font-size: 18px;
  font-weight: 600;
}
.user-meta {
  margin-top: 4px;
  color: var(--text-tertiary);
  font-size: 13px;
}
.card-title {
  font-weight: 600;
  margin-bottom: 12px;
}
.hint {
  color: var(--text-tertiary);
  font-size: 13px;
}
.identity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.identity-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md, 6px);
  background: var(--bg-primary);
}
.identity-provider {
  font-weight: 500;
  text-transform: capitalize;
}
.identity-time {
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
