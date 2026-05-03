<template>
  <div class="login-page">
    <div class="login-card">
      <div v-if="!ready" class="state">
        <div class="state-title">加载中…</div>
      </div>
      <div v-else-if="loadError" class="state state-error">
        <div class="state-title">无法加载登录方式</div>
        <div class="state-detail">
          <code>{{ loadError.code }}</code>
          <template v-if="loadError.status"> · HTTP {{ loadError.status }}</template>
        </div>
        <div class="state-hint">{{ errorHint }}</div>
        <el-button size="small" @click="loadProviders">重试</el-button>
      </div>
      <div v-else-if="!availableTabs.length" class="state">
        <div class="state-title">没有可用的登录方式</div>
        <div class="state-hint">已连上后端,但没有任何 interactive provider 注册。请检查是否装载了 sso-password / sso-mail / sso-oauth 等 provider 插件。</div>
      </div>
      <template v-else>
        <div class="mode-switch">
          <el-radio-group v-model="mode">
            <el-radio-button value="login">登录</el-radio-button>
            <el-radio-button value="register">注册</el-radio-button>
          </el-radio-group>
        </div>
        <el-tabs v-model="tab" class="provider-tabs">
          <el-tab-pane v-if="hasPassword" name="password" label="密码">
            <password-form
              :mode="mode"
              :loading="loading"
              @submit="handleSubmit('password', $event)"
            />
          </el-tab-pane>
          <el-tab-pane v-if="hasMail" name="mail" label="邮箱">
            <mail-form
              provider="mail"
              :mode="mode"
              :loading="loading"
              @submit="handleSubmit('mail', $event)"
            />
          </el-tab-pane>
          <el-tab-pane v-if="oauthProviders.length" name="oauth" label="第三方">
            <o-auth-list :mode="mode" :providers="oauthProviders" />
          </el-tab-pane>
        </el-tabs>
      </template>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  listProviders,
  login as doLogin,
  register as doRegister,
  SsoError,
} from './store'
import type { AuthMode, ProviderMeta } from '../shared'
import PasswordForm from './providers/password.vue'
import MailForm from './providers/mail.vue'
import OAuthList from './providers/oauth.vue'

type Tab = 'password' | 'mail' | 'oauth'

const mode = ref<AuthMode>('login')
const providers = ref<ProviderMeta[]>([])
const loading = ref(false)
const ready = ref(false)
const loadError = ref<{ code: string; status?: number } | null>(null)

const interactive = computed(() => providers.value.filter(p => p.interactive))

const hasPassword = computed(() => interactive.value.some(p => p.name === 'password'))
const hasMail = computed(() => interactive.value.some(p => p.name === 'mail'))
const oauthProviders = computed(() => interactive.value.filter(p => {
  return !['password', 'mail', 'sms', 'webauthn', 'totp'].includes(p.name)
}))

const availableTabs = computed<Tab[]>(() => {
  const tabs: Tab[] = []
  if (hasPassword.value) tabs.push('password')
  if (hasMail.value) tabs.push('mail')
  if (oauthProviders.value.length) tabs.push('oauth')
  return tabs
})

const tab = ref<Tab>('password')

const errorHint = computed(() => {
  if (!loadError.value) return ''
  if (loadError.value.status === 404) {
    return '后端没有响应 /sso/providers 路由,通常是没有装载 @cordisjs/plugin-sso-server。'
  }
  if (loadError.value.code.startsWith('HTTP_5')) {
    return '后端返回了服务器错误,请查看 cordis 日志。'
  }
  return '可能是网络问题或后端未启动,请检查 server 是否运行。'
})

async function loadProviders() {
  ready.value = false
  loadError.value = null
  try {
    providers.value = await listProviders()
    if (!availableTabs.value.includes(tab.value) && availableTabs.value.length) {
      tab.value = availableTabs.value[0]
    }
  } catch (e) {
    if (e instanceof SsoError) {
      loadError.value = { code: e.code, status: e.status }
    } else {
      loadError.value = { code: e instanceof Error ? e.message : 'NETWORK_ERROR' }
    }
  } finally {
    ready.value = true
  }
}

onMounted(loadProviders)

async function handleSubmit(provider: string, credentials: any) {
  loading.value = true
  try {
    if (mode.value === 'login') {
      await doLogin(provider, credentials)
    } else {
      await doRegister(provider, credentials)
    }
    ElMessage.success(mode.value === 'login' ? '登录成功' : '注册成功')
  } catch (e) {
    if (e instanceof SsoError) {
      ElMessage.error(`${mode.value === 'login' ? '登录' : '注册'}失败: ${e.code}`)
    } else {
      ElMessage.error(`${mode.value === 'login' ? '登录' : '注册'}失败`)
    }
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
.login-page {
  display: flex;
  flex-direction: column;
  padding: 16px;
  flex: 1;
  min-height: 0;
}
.login-card {
  margin: auto;
  width: 100%;
  max-width: 420px;
  background: var(--bg-elevated, var(--bg-secondary));
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg, 8px);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
}
.mode-switch {
  display: flex;
  justify-content: center;
}
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  text-align: center;
}
.state-title {
  font-weight: 600;
}
.state-detail code {
  background: var(--bg-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}
.state-hint {
  color: var(--text-tertiary);
  font-size: 13px;
  max-width: 320px;
}
.state-error .state-title {
  color: var(--error, #e25c5c);
}
.provider-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}
</style>
