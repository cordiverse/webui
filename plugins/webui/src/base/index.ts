import { Context, Inject, Service } from 'cordis'
import { Dict } from 'cosmokit'
import { Client } from './client.ts'
import { Entry } from './entry.ts'
import { WebSocket } from './types.ts'

export * from './client.ts'
export * from './entry.ts'
export * from './types.ts'

declare module 'cordis' {
  interface Context {
    webui: WebUI
  }

  interface Events {
    'webui/connection'(this: WebUI, client: Client): void
  }
}

export type SocketListener = (this: Client, ...args: any[]) => void

@Inject('logger', true, { name: 'webui' })
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

  protected accept(socket: WebSocket) {
    const client = new Client(this.ctx, socket)
    socket.addEventListener('close', () => {
      delete this.clients[client.id]
      this.ctx.emit(this, 'webui/connection', client)
    })
    this.clients[client.id] = client
    this.ctx.emit(this, 'webui/connection', client)
  }

  abstract getEntryFiles(entry: Entry): string[]
  abstract resolveManifestUrl(files: Entry.Files): string | undefined
  abstract addListener<K extends keyof Events>(event: K, callback: Events[K]): void

  addEntry<T extends object = never>(files: Entry.Files, data?: T) {
    return new Entry<T>(this.ctx, files, data as T)
  }

  broadcast(type: string, body: any) {
    const payload = JSON.stringify({ type, body })
    for (const client of Object.values(this.clients)) {
      client.socket.send(payload)
    }
  }
}

export interface Events {}

export namespace WebUI {
  export interface Services {}
}

export default WebUI
