import { Context } from '@cordisjs/client'
import { Ref } from 'vue'
import type { Data } from '../src'
import Logs from './index.vue'
import Settings from './settings.vue'
import LoaderIntercept from './loader-intercept.vue'
import './index.scss'
import './icons'

export const inject = ['manager']

export function apply(ctx: Context, data: Ref<Data>) {
  ctx.client.router.page({
    path: '/logs',
    name: '日志',
    icon: 'activity:logs',
    order: 0,
    component: Logs,
  })

  ctx.client.router.slot({
    type: 'loader-intercept',
    component: LoaderIntercept,
    order: -800,
  })

  ctx.inject(['manager'], (ctx) => {
    ctx.on('webui/loader/service', (entry, name) => {
      if (name !== 'logger') return
      const full = ctx.manager.prefix + entry.id
      return data.value?.entryIds?.includes(full) ?? false
    })
  })
}
