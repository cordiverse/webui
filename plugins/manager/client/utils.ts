import { Schema, FiberState } from '@cordisjs/client'
import { nextTick, Ref } from 'vue'
import { EntryData } from '../src'

export function getStatusClass(entry: EntryData) {
  switch (entry?.state) {
    case FiberState.PENDING: return 'pending'
    case FiberState.LOADING: return 'loading'
    case FiberState.ACTIVE: return 'active'
    case FiberState.FAILED: return 'failed'
    case FiberState.DISPOSED: return 'disposed'
    case FiberState.UNLOADING: return 'unloading'
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
