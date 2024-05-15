import type { ClientConfig, Events, WebSocket } from '@cordisjs/plugin-webui'
import type { Promisify } from 'cosmokit'
import { markRaw, ref } from 'vue'
import { Context } from './context'
import { root } from '.'

declare const KOISHI_CONFIG: ClientConfig
export const global = KOISHI_CONFIG

export const socket = ref<WebSocket>()
const listeners: Record<string, (data: any) => void> = {}

export function send<T extends keyof Events>(type: T, ...args: Parameters<Events[T]>): Promisify<ReturnType<Events[T]>>
export async function send(type: string, ...args: any[]) {
  if (global.static) {
    console.debug('[request]', type, ...args)
    const result = root.webui.listeners[type]?.(...args)
    console.debug('[response]', result)
    return result
  }
  if (!socket.value) return
  console.debug('[request]', type, ...args)
  const response = await fetch(`${global.endpoint}/${type}`, {
    method: 'POST',
    body: JSON.stringify(args[0]),
    headers: new Headers({
      'Content-Type': 'application/json',
    }),
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
