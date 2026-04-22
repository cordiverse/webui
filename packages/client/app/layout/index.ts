import { Context } from '@cordisjs/client'
import Layout from './layout.vue'
import TabBar from './tab-bar.vue'

export default function (ctx: Context) {
  ctx.client.app.component('k-tab-bar', TabBar)
  ctx.client.router.slot({
    type: 'layout',
    component: Layout,
    order: -1000,
  })
}
