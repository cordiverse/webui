import { Context, icons } from '@cordisjs/client'
import {} from '../src'
import Compose from './compose.vue'
import HistoryPage from './history-page.vue'
import IconHttp from './icons/http.vue'
import IconHistory from './icons/history.vue'

icons.register('activity:http', IconHttp)
icons.register('activity:http-history', IconHistory)

export default (ctx: Context) => {
  ctx.client.router.page({
    path: '/http/compose',
    name: 'HTTP Compose',
    icon: 'activity:http',
    order: 560,
    component: Compose,
  })

  ctx.client.router.page({
    path: '/http/history',
    name: 'HTTP History',
    icon: 'activity:http-history',
    order: 555,
    component: HistoryPage,
  })
}
