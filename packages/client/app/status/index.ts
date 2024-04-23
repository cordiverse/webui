import { Context } from '@cordisjs/client'
import Status from './status.vue'
import Loading from './loading.vue'

export default function (ctx: Context) {
  ctx.slot({
    type: 'status',
    component: Status,
    order: -1000,
  })

  ctx.slot({
    type: 'status-right',
    component: Loading,
  })
}
