import type { Dict } from 'cosmokit'
import { ref } from 'vue'
import { useStorage } from '@cordisjs/client'

export interface MarketStorage {
  bulkMode: boolean
  removeConfig?: boolean
  override: Dict<string>
}

export const storage = useStorage<MarketStorage>('market', 1, () => ({
  bulkMode: false,
  removeConfig: undefined,
  override: {},
}))

// Module-level singletons so dialogs work across pages
export const activePackage = ref('')
export const showConfirm = ref(false)
export const showManual = ref(false)
