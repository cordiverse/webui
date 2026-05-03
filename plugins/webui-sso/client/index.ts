import { Context } from '@cordisjs/client'
import {} from '../src'
import Page from './index.vue'
import { consumeOAuthCallback, refresh } from './store'
import { ElMessage } from 'element-plus'
import './icons'

export default async (ctx: Context) => {
  const { token, error } = consumeOAuthCallback()
  if (error) {
    ElMessage.error(`OAuth 失败: ${error}`)
  }
  // We refresh regardless: a callback may have set a token, or we may already
  // have a stored token from a prior session.
  await refresh()
  void token  // token already persisted by consumeOAuthCallback

  ctx.client.router.page({
    path: '/sso',
    name: '账号',
    icon: 'activity:webui-sso',
    position: 'bottom',
    order: -110,
    component: Page,
  })
}
