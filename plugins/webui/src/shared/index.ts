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

export abstract class WebUI extends Service {
  public id = Math.random().toString(36).slice(2)

  readonly entries: Dict<Entry> = Object.create(null)
  readonly listeners: Dict<(args?: any) => any> = Object.create(null)
  readonly clients: Dict<Client> = Object.create(null)

  constructor(public ctx: Context) {
    super(ctx, 'webui')
    this.listeners.ping = function () {
      this.send({ type: 'pong' })
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

  abstract getEntryFiles(entry: Entry): string[]
  abstract addListener<K extends keyof Events>(event: K, callback: Events[K]): void

  addEntry<T>(files: Entry.Files, data?: (client: Client) => T) {
    return new Entry(this.ctx, files, data)
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
