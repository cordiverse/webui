<template>
  <div class="oauth-list">
    <el-button
      v-for="p in providers"
      :key="p.name"
      class="oauth-button"
      @click="onClick(p.name)"
    >
      使用 {{ p.name }} {{ mode === 'register' ? '注册' : mode === 'link' ? '绑定' : '登录' }}
    </el-button>
    <p v-if="!providers.length" class="empty">未配置任何 OAuth provider</p>
  </div>
</template>

<script lang="ts" setup>
import { ElMessage } from 'element-plus'
import { getAuthUrl } from '../store'
import type { AuthMode, ProviderMeta } from '../../shared'

defineProps<{ mode: AuthMode; providers: ProviderMeta[] }>()

async function onClick(name: string) {
  try {
    const url = await getAuthUrl(name)
    location.assign(url)
  } catch (e: any) {
    ElMessage.error(`无法启动 ${name} 授权: ${e?.code ?? 'unknown'}`)
  }
}
</script>

<style lang="scss" scoped>
.oauth-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.oauth-button {
  width: 100%;
  text-transform: capitalize;
}
.empty {
  color: var(--text-tertiary);
  font-size: 13px;
  text-align: center;
}
</style>
