import type { ClientConfig, DataService, Events, WebSocket, WebUI } from '@cordisjs/plugin-webui'
import type { Promisify } from 'cosmokit'
import { markRaw, ref } from 'vue'
import { Context } from './context'

export type Store = {
  [K in keyof WebUI.Services]?: WebUI.Services[K] extends DataService<infer T> ? T : never
}

declare const KOISHI_CONFIG: ClientConfig
export const global = KOISHI_CONFIG

export function withProxy(url: string) {
  return (global.proxyBase || '') + url
}

export const socket = ref<WebSocket>()
const listeners: Record<string, (data: any) => void> = {}

export function send<T extends keyof Events>(type: T, ...args: Parameters<Events[T]>): Promisify<ReturnType<Events[T]>>
export async function send(type: string, ...args: any[]) {
  if (!socket.value) return
  console.debug('[request]', type, args)
  const response = await fetch(`${global.endpoint}/${type}`, {
    method: 'POST',
    body: JSON.stringify(args[0]),
  })
  const result = await response.json()
  console.debug('[response]', result)
  return result
}

export function receive<T = any>(event: string, listener: (data: T) => void) {
  listeners[event] = listener
}

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
    socket.value = undefined
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
    if (data.type in listeners) {
      listeners[data.type](data.body)
    }
    ctx.emit(data.type, data.body)
  })

  value.addEventListener('close', reconnect)

  return new Promise<WebSocket.Event>((resolve, reject) => {
    value.addEventListener('open', (event) => {
      socket.value = markRaw(value)
      resolve(event)
    })
    value.addEventListener('error', reject)
  })
}
