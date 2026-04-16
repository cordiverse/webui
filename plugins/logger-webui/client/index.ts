import { Context, Dict } from '@cordisjs/client'
import { Ref } from 'vue'
import type { Message } from '@cordisjs/plugin-logger'
import {} from '../src'
import Logs from './index.vue'
import Settings from './settings.vue'
import './index.scss'
import './icons'

export const inject = {
  manager: false,
}

export function apply(ctx: Context, data: Ref<Dict<Message[]>>) {
  ctx.client.router.page({
    path: '/logs',
    name: '日志',
    icon: 'activity:logs',
    order: 0,
    component: Logs,
  })

  ctx.client.router.slot({
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
  //         if (data.value[index].meta.entryId !== entry.id) continue
  //         return false
  //       }
  //       return true
  //     },
  //   })
  // })
}
