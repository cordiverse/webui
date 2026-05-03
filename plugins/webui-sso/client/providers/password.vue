<template>
  <el-form
    class="provider-form"
    label-position="top"
    @submit.prevent="onSubmit"
  >
    <el-form-item label="用户名">
      <el-input v-model="username" autocomplete="username" :disabled="loading" />
    </el-form-item>
    <el-form-item label="密码">
      <el-input
        v-model="password"
        type="password"
        show-password
        autocomplete="current-password"
        :disabled="loading"
      />
    </el-form-item>
    <el-button
      type="primary"
      native-type="submit"
      :loading="loading"
      :disabled="!username || !password"
    >
      {{ submitLabel }}
    </el-button>
  </el-form>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue'
import type { AuthMode } from '../../shared'

const props = defineProps<{ mode: AuthMode; loading?: boolean }>()
const emit = defineEmits<{ submit: [{ username: string; password: string }] }>()

const username = ref('')
const password = ref('')
const submitLabel = computed(() => {
  if (props.mode === 'login') return '登录'
  if (props.mode === 'register') return '注册'
  return '绑定'
})

function onSubmit() {
  if (!username.value || !password.value) return
  emit('submit', { username: username.value, password: password.value })
}
</script>

<style lang="scss" scoped>
.provider-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
