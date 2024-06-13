import { Context } from '@cordisjs/client'
import {} from '../src'
import Logs from './index.vue'
import Settings from './settings.vue'
import './index.scss'
import './icons'

export const inject = {
  manager: false,
}

export function apply(ctx: Context) {
  ctx.page({
    path: '/logs',
    name: '日志',
    icon: 'activity:logs',
    order: 0,
    component: Logs,
  })

  ctx.slot({
    type: 'plugin-details',
    component: Settings,
    order: -800,
  })

  // this.subroute({
  //   path: 'logs',
  //   title: '日志',
  //   component: ServicesPage,
  //   hidden: (entry) => {
  //     return !this.data.value.packages[entry.name]?.runtime
  //   },
  // })
}
