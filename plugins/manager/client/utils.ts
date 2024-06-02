import { Schema, ScopeStatus } from '@cordisjs/client'
import { nextTick, Ref } from 'vue'
import { EntryData } from '../src'

export function getStatusClass(entry: EntryData) {
  switch (entry?.status) {
    case ScopeStatus.PENDING: return 'pending'
    case ScopeStatus.LOADING: return 'loading'
    case ScopeStatus.ACTIVE: return 'active'
    case ScopeStatus.FAILED: return 'failed'
    case ScopeStatus.DISPOSED: return 'disposed'
    default: return 'disabled'
  }
}

export function hasSchema(schema?: Schema) {
  if (!schema) return false
  schema = new Schema(schema)
  if (schema.type === 'object') {
    return Object.keys(schema.dict!).length > 0
  } else if (schema.type === 'intersect') {
    return schema.list!.some(hasSchema)
  } else {
    return true
  }
}

export function useAutoFocus(el: Ref<HTMLInputElement>) {
  return async () => {
    // https://github.com/element-plus/element-plus/issues/15250
    await nextTick()
    el.value?.focus()
  }
}
