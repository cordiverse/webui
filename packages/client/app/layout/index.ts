import { Context } from '@cordisjs/client'
import Layout from './layout.vue'

export default function (ctx: Context) {
  ctx.client.router.slot({
    type: 'layout',
    component: Layout,
    order: -1000,
  })
}
