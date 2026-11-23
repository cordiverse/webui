import { Context, icons } from '@cordisjs/client'
import {} from '../src'
import Routes from './routes.vue'
import Requests from './requests.vue'
import IconServer from './icons/server.vue'
import IconRequests from './icons/requests.vue'

icons.register('activity:server', IconServer)
icons.register('activity:server-requests', IconRequests)

export default (ctx: Context) => {
  ctx.client.router.page({
    path: '/server/routes',
    name: 'Routes',
    icon: 'activity:server',
    order: 540,
    component: Routes,
  })

  ctx.client.router.page({
    path: '/server/requests',
    name: 'Inbound HTTP',
    icon: 'activity:server-requests',
    order: 535,
    component: Requests,
  })
}
