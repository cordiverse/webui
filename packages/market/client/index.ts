import { Context, icons } from '@cordisjs/client'
import { Ref, watch } from 'vue'
import type { Data } from '../src'
import { storage } from './store'
import Main from './index.vue'
import Deps from './deps.vue'
import Dialogs from './dialogs.vue'
import PluginMissing from './plugin-missing.vue'
import PluginDependency from './dependency.vue'
import IconMarket from './icons/market.vue'
import IconDeps from './icons/deps.vue'

icons.register('activity:market', IconMarket)
icons.register('activity:deps', IconDeps)

export default (ctx: Context, data: Ref<Data>) => {
  ctx.client.router.page({
    path: '/market',
    name: 'Market',
    icon: 'activity:market',
    order: 520,
    component: Main,
  })

  ctx.client.router.page({
    path: '/dependencies',
    name: 'Dependencies',
    icon: 'activity:deps',
    order: 510,
    component: Deps,
  })

  ctx.client.router.slot({
    type: 'global',
    component: Dialogs,
  })

  ctx.inject(['manager'], (ctx) => {
    ctx.client.router.slot({
      type: 'plugin-missing',
      component: PluginMissing,
    })

    ctx.client.router.slot({
      type: 'plugin-dependency',
      component: PluginDependency,
    })
  })

  // Auto-clear override entries that have been satisfied (or rendered moot)
  // by changes in the resolved dependencies map.
  ctx.effect(() => watch(() => data.value?.dependencies, (deps) => {
    if (!deps) return
    const next = { ...storage.value.override }
    let changed = false
    for (const key of Object.keys(next)) {
      const dep = deps[key]
      // dependency now resolves to a workspace package — overrides don't apply
      if (dep?.workspace) {
        delete next[key]
        changed = true
        continue
      }
      // override == '' (pending removal) and dep is gone
      if (!next[key] && !dep) {
        delete next[key]
        changed = true
        continue
      }
      // dep request matches override — install completed
      if (dep?.request === next[key]) {
        delete next[key]
        changed = true
      }
    }
    if (changed) storage.value.override = next
  }, { immediate: true, deep: true }))
}

