import { Context, icons } from '@cordisjs/client'
import {} from '../src'
import Main from './index.vue'
import IconMarket from './icons/market.vue'

icons.register('activity:market', IconMarket)

export default (ctx: Context) => {
  ctx.client.router.page({
    path: '/market',
    name: 'Market',
    icon: 'activity:market',
    order: 520,
    component: Main,
  })
}
