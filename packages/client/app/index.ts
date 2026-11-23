import { connect, createClient, global } from '@cordisjs/client'
import home from './home'
import layout from './layout'
import settings from './settings'
import status from './status'
import styles from './styles'
import theme from './theme'

import 'virtual:uno.css'
import './index.scss'

const root = createClient()

root.use(home)
root.use(layout)
root.use(settings)
root.use(status)
root.use(styles)
root.use(theme)

if (!global.static) {
  const endpoint = new URL(global.endpoint, location.origin).toString()
  connect(root, () => new WebSocket(endpoint.replace(/^http/, 'ws')))
}

root.client.mount('#app')
