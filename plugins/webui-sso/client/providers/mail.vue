<template>
  <el-form
    class="provider-form"
    label-position="top"
    @submit.prevent="onSubmit"
  >
    <el-form-item label="邮箱">
      <div class="email-row">
        <el-input
          v-model="email"
          type="email"
          autocomplete="email"
          :disabled="loading || verifying"
        />
        <el-button
          :loading="sending"
          :disabled="!email || loading"
          @click="onSendCode"
        >
          {{ challengeId ? '重新发送' : '发送验证码' }}
        </el-button>
      </div>
    </el-form-item>
    <el-form-item label="验证码">
      <el-input
        v-model="code"
        :disabled="!challengeId || loading"
        placeholder="请输入收到的验证码"
      />
    </el-form-item>
    <el-button
      type="primary"
      native-type="submit"
      :loading="loading || verifying"
      :disabled="!email || !code || !challengeId"
    >
      {{ submitLabel }}
    </el-button>
  </el-form>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { challenge as sendChallenge, verify as verifyChallenge, SsoError } from '../store'
import type { AuthMode } from '../../shared'

const props = defineProps<{ mode: AuthMode; loading?: boolean; provider?: string }>()
const emit = defineEmits<{ submit: [{ email: string }] }>()

// The mail provider's resolve only checks email — there's no built-in code
// gate during /sso/auth/mail. We enforce verification here on the client by
// requiring a successful /sso/verify before emitting submit. If the backend
// adds a real check later this still works.

const providerName = computed(() => props.provider ?? 'mail')
const email = ref('')
const code = ref('')
const challengeId = ref<string | null>(null)
const sending = ref(false)
const verifying = ref(false)

const submitLabel = computed(() => {
  if (props.mode === 'login') return '登录'
  if (props.mode === 'register') return '注册'
  return '绑定'
})

async function onSendCode() {
  if (!email.value) return
  sending.value = true
  try {
    const res = await sendChallenge(providerName.value, { email: email.value })
    challengeId.value = res.challengeId
    ElMessage.success('验证码已发送')
  } catch (e: any) {
    ElMessage.error(`发送失败: ${e?.code ?? e?.message ?? 'unknown'}`)
  } finally {
    sending.value = false
  }
}

async function onSubmit() {
  if (!email.value || !code.value || !challengeId.value) return
  verifying.value = true
  try {
    await verifyChallenge(providerName.value, challengeId.value, code.value)
  } catch (e) {
    if (e instanceof SsoError && e.status === 401) {
      ElMessage.error('验证码错误或已过期')
    } else {
      ElMessage.error('验证失败')
    }
    verifying.value = false
    return
  }
  verifying.value = false
  emit('submit', { email: email.value })
  code.value = ''
  challengeId.value = null
}
</script>

<style lang="scss" scoped>
.provider-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.email-row {
  display: flex;
  gap: 8px;
  width: 100%;

  :deep(.el-input) {
    flex: 1;
  }
}
</style>
