/**
 * Client-side plugin: registers the multi-instance pages + icons + share
 * action. Mounted on the same Context as the rest of the client; behaves
 * like any other webui plugin.
 *
 * Lives in the *online package* (not the webui plugin) because instance
 * management is online-specific. A real cordis deployment has one app, not
 * a menu of apps.
 */

import { Context, icons } from '@cordisjs/client'
import IconInstance from '../icons/instance.vue'
import IconOnline from '../icons/online.vue'
import Home from './pages/home.vue'

export function apply(ctx: Context) {
  icons.register('activity:instances', IconInstance)
  icons.register('activity:online', IconOnline)

  // Instance picker — always visible. `app/home` owns `/` (欢迎); this lives
  // at `/instances`.
  ctx.client.router.page({
    id: 'online-instances',
    path: '/instances',
    name: '实例',
    icon: 'activity:instances',
    order: 900,
    component: Home,
  })
}

export default { apply }
