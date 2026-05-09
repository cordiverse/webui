import { Context } from '@cordisjs/client'
import App from './index.vue'

export default function (ctx: Context) {
  ctx.client.router.slot({
    type: 'root',
    component: App,
    order: -1000,
  })

  const config = ctx.client.setting.resolved

  ctx.client.action.action('theme.activity.settings', {
    action: () => ctx.client.router.router.push('/settings/activity'),
  })

  ctx.client.action.action('theme.activity.reset', {
    action: () => config.value.activities = {},
  })

  ctx.client.action.menu('theme.activity', [{
  //   id: '.settings',
  //   label: '活动栏设置',
  // }, {
    id: '.reset',
    label: '重置活动栏',
  }])
}
