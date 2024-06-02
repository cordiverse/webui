import { ScopeStatus } from '@cordisjs/client'

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
