import { Context } from '@cordisjs/client'
import Status from './status.vue'
import Loading from './loading.vue'

export default function (ctx: Context) {
  ctx.client.router.slot({
    type: 'status',
    component: Status,
    order: -1000,
  })

  ctx.client.router.slot({
    type: 'status-right',
    component: Loading,
  })
}
