import { ScopeStatus } from '@cordisjs/client'
import { nextTick, Ref } from 'vue'

export function getStatusClass(status?: ScopeStatus) {
  switch (status) {
    case ScopeStatus.PENDING: return 'pending'
    case ScopeStatus.LOADING: return 'loading'
    case ScopeStatus.ACTIVE: return 'active'
    case ScopeStatus.FAILED: return 'failed'
    case ScopeStatus.DISPOSED: return 'disposed'
    default: return 'disabled'
  }
}

export function useAutoFocus(el: Ref<HTMLInputElement>) {
  return async () => {
    // https://github.com/element-plus/element-plus/issues/15250
    await nextTick()
    el.value?.focus()
  }
}
