import { Context, icons } from '@cordisjs/client'
import {} from '../src'
import Main from './index.vue'
import IconHttp from './icons/http.vue'

icons.register('activity:http', IconHttp)

export default (ctx: Context) => {
  ctx.client.router.page({
    path: '/http',
    name: 'HTTP',
    icon: 'activity:http',
    order: 540,
    component: Main,
  })
}
