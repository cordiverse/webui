import type { Logger } from 'cordis'
import {} from '../src'
import Logs from './index.vue'
import Settings from './settings.vue'
import './index.scss'
import './icons'

export const inject = {
  manager: false,
}

export function apply(ctx: Context, data: Ref<Dict<Logger.Record[]>>) {
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

  // ctx.inject(['manager'], (ctx) => {
  //   ctx.manager.subroute({
  //     path: 'logs',
  //     title: '日志',
  //     component: Settings,
  //     hidden: (entry) => {
  //       let last = Infinity
  //       for (let index = data.value.length - 1; index > 0; --index) {
  //         if (data.value[index].id >= last) break
  //         last = data.value[index].id
  //         if (!data.value[index].meta.paths?.includes(entry.id)) continue
  //         return false
  //       }
  //       return true
  //     },
  //   })
  // })
}
