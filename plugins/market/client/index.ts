import { Context, icons } from '@cordisjs/client'
import {} from '../src'
import Main from './index.vue'
import Deps from './deps.vue'
import IconMarket from './icons/market.vue'
import IconDeps from './icons/deps.vue'

icons.register('activity:market', IconMarket)
icons.register('activity:deps', IconDeps)

export default (ctx: Context) => {
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
}
