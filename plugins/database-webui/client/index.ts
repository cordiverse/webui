import { Context, icons } from '@cordisjs/client'
import {} from '../src'
import Page from './index.vue'
import IconDatabase from './icons/database.vue'

icons.register('activity:database', IconDatabase)

export default (ctx: Context) => {
  ctx.client.router.page({
    path: '/database',
    name: 'Database',
    icon: 'activity:database',
    order: 530,
    component: Page,
  })
}
