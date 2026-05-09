import type { ClientConfig, WebSocket } from '@cordisjs/plugin-webui'
import { markRaw } from 'vue'
import { Context } from 'cordis'

declare const CLIENT_CONFIG: ClientConfig
export const global = CLIENT_CONFIG

export function connect(ctx: Context, callback: () => WebSocket) {
  const value = callback()

  let sendTimer: number
  let closeTimer: number
  const refresh = () => {
    if (!global.heartbeat) return

    clearTimeout(sendTimer)
    sendTimer = +setTimeout(() => {
      value?.send(JSON.stringify({ type: 'ping' }))
    }, global.heartbeat.interval)

    clearTimeout(closeTimer)
    closeTimer = +setTimeout(() => {
      value?.close()
    }, global.heartbeat.timeout)
  }

  const reconnect = () => {
    ctx.client.socket.value = undefined
    console.log('[cordis] websocket disconnected, will retry in 1s...')
    setTimeout(() => {
      connect(ctx, callback).then(location.reload, () => {
        console.log('[cordis] websocket disconnected, will retry in 1s...')
      })
    }, 1000)
  }

  value.addEventListener('message', (ev) => {
    refresh()
    const data = JSON.parse(ev.data)
    if (data.type !== 'pong') {
      console.debug('↓%c', 'color:purple', data.type, data.body)
    }
    ctx.emit(data.type, data.body)
  })

  value.addEventListener('close', reconnect)

  return new Promise<WebSocket.Event>((resolve, reject) => {
    value.addEventListener('open', (event) => {
      ctx.client.socket.value = markRaw(value)
      resolve(event)
    })
    value.addEventListener('error', reject)
  })
}
