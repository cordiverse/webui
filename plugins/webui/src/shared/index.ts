import { Context, Service } from 'cordis'
import { Awaitable, Dict, valueMap } from 'cosmokit'
import { DataService } from './service.ts'
import { Client } from './client.ts'
import { IncomingMessage } from 'node:http'
import { Entry } from './entry.ts'
import { WebSocket } from './types.ts'

export * from './client.ts'
export * from './entry.ts'
export * from './service.ts'

declare module 'cordis' {
  interface Context {
    webui: WebUI
  }

  interface Events {
    'webui/connection'(client: Client): void
    'webui/intercept'(client: Client, listener: DataService.Options): Awaitable<boolean>
  }
}

export interface Listener extends DataService.Options {
  callback(this: Client, ...args: any[]): Awaitable<any>
}

export interface EntryData {
  files: string[]
  paths?: string[]
  data: () => any
}

export class EntryProvider extends DataService<Dict<EntryData>> {
  static inject = []

  constructor(ctx: Context) {
    super(ctx, 'entry', { immediate: true })
  }

  async get(forced: boolean, client: Client) {
    return this.ctx.get('webui')!.get(client)
  }
}

export abstract class WebUI<T = unknown> extends Service<T> {
  private id = Math.random().toString(36).slice(2)

  readonly entries: Dict<Entry> = Object.create(null)
  readonly listeners: Dict<Listener> = Object.create(null)
  readonly clients: Dict<Client> = Object.create(null)

  constructor(public ctx: Context, public config: T) {
    super(ctx, 'webui', true)
    ctx.plugin(EntryProvider)
    this.addListener('ping', () => 'pong')
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

  async get(client: Client) {
    const result = valueMap(this.entries, ({ files, ctx, data }, key) => ({
      files: this.resolveEntry(files, key),
      paths: this.ctx.get('loader')?.paths(ctx.scope),
      data: data?.(client),
    }))
    result['_id'] = this.id as any
    return result
  }

  protected abstract resolveEntry(files: Entry.Files, key: string): string[]

  addEntry<T>(files: Entry.Files, data?: () => T) {
    return new Entry(this[Context.origin], files, data)
  }

  addListener<K extends keyof Events>(event: K, callback: Events[K], options?: DataService.Options) {
    this.listeners[event] = { callback, ...options }
  }

  async broadcast(type: string, body: any, options: DataService.Options = {}) {
    const handles = Object.values(this.clients)
    if (!handles.length) return
    await Promise.all(Object.values(this.clients).map(async (client) => {
      if (await this.ctx.serial('webui/intercept', client, options)) return
      const data = { type, body }
      if (typeof body === 'function') data.body = await body(client)
      client.socket.send(JSON.stringify(data))
    }))
  }

  refresh<K extends keyof WebUI.Services>(type: K) {
    return this.ctx.get(`webui:${type}`)?.refresh()
  }

  patch<K extends keyof WebUI.Services>(type: K, value: WebUI.Services[K] extends DataService<infer T> ? T : never) {
    return this.ctx.get(`webui:${type}`)?.patch(value as any)
  }
}

export interface Events {
  'ping'(): string
}

export namespace WebUI {
  export interface Services {
    entry: EntryProvider
  }
}

export default WebUI
