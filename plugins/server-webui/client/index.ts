import { Context, icons } from '@cordisjs/client'
import {} from '../src'
import Main from './index.vue'
import IconServer from './icons/server.vue'

icons.register('activity:server', IconServer)

export default (ctx: Context) => {
  ctx.client.router.page({
    path: '/server',
    name: 'Server',
    icon: 'activity:server',
    order: 530,
    component: Main,
  })
}
