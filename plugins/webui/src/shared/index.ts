import { Context, Service } from 'cordis'
import { Dict } from 'cosmokit'
import { Client } from './client.ts'
import { IncomingMessage } from 'node:http'
import { Entry } from './entry.ts'
import { WebSocket } from './types.ts'

export * from './client.ts'
export * from './entry.ts'

declare module 'cordis' {
  interface Context {
    webui: WebUI
  }

  interface Events {
    'webui/connection'(client: Client): void
  }
}

export type SocketListener = (this: Client, ...args: any[]) => void

export abstract class WebUI<T = unknown> extends Service<T> {
  public id = Math.random().toString(36).slice(2)

  readonly entries: Dict<Entry> = Object.create(null)
  readonly apis: Dict<SocketListener> = Object.create(null)
  readonly listeners: Dict<(args?: any) => any> = Object.create(null)
  readonly clients: Dict<Client> = Object.create(null)

  constructor(public ctx: Context, public config: T) {
    super(ctx, 'webui', true)
    this.listeners.ping = function () {
      this.send(JSON.stringify({ type: 'pong' }))
    }
  }

  protected accept(socket: WebSocket, request?: IncomingMessage) {
    const client = new Client(this.ctx, socket, request)
    socket.addEventListener('close', () => {
      delete this.clients[client.id]
      this.ctx.emit('webui/connection', client)
    })
    this.clients[client.id] = client
    this.ctx.emit('webui/connection', client)
  }

  abstract resolveEntry(files: Entry.Files, key: string): string[]

  addEntry<T>(files: Entry.Files, data?: () => T) {
    return new Entry(this[Context.origin], files, data)
  }

  addListener<K extends keyof Events>(event: K, callback: Events[K]) {
    this.apis[event] = callback
    this.ctx.server.post(`/${event}`, async (koa) => {
      const { body } = koa.request
      try {
        koa.body = await (callback as any)(body)
        koa.status = 200
      } catch (error) {
        this.ctx.logger.warn(error)
        koa.status = 500
      }
    })
  }

  async broadcast(type: string, body: any) {
    const handles = Object.values(this.clients)
    if (!handles.length) return
    await Promise.all(Object.values(this.clients).map(async (client) => {
      const data = { type, body }
      if (typeof body === 'function') data.body = await body(client)
      client.socket.send(JSON.stringify(data))
    }))
  }
}

export interface Events {}

export namespace WebUI {
  export interface Services {}
}

export default WebUI
