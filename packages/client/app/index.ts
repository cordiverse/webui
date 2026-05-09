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

root.plugin(home)
root.plugin(layout)
root.plugin(settings)
root.plugin(status)
root.plugin(styles)
root.plugin(theme)

if (!global.static) {
  const endpoint = new URL(global.endpoint, location.origin).toString()
  connect(root, () => new WebSocket(endpoint.replace(/^http/, 'ws')))
}

root.client.mount('#app')
