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

export interface ActivePackage {
  name: string
  /** Whether the global bulk-mode toggle should apply to this dialog. */
  bulkModeEnabled: boolean
}

// Module-level singletons so dialogs work across pages
export const activePackage = ref<ActivePackage>({ name: '', bulkModeEnabled: true })
export const showConfirm = ref(false)
export const showManual = ref(false)
