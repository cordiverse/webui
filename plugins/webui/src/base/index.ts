import { Context, Inject, Service } from 'cordis'
import { Dict } from 'cosmokit'
import { pathToRegexp } from 'path-to-regexp'
import { Client } from './client.ts'
import { Entry } from './entry.ts'
import { WebSocket } from './types.ts'
import type { RpcRequest } from '../../shared/index.d.ts'

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

export abstract class WebUI extends Service {
  static name = 'webui'

  public version!: string

  readonly entries: Dict<Entry> = Object.create(null)
  readonly listeners: Dict<(args?: any) => any> = Object.create(null)
  readonly clients: Dict<Client> = Object.create(null)

  constructor(public ctx: Context) {
    super(ctx, 'webui')
    this.listeners.ping = function () {
      this.send({ type: 'pong' })
    }
    this.listeners['rpc:request'] = async function (this: Client, body: RpcRequest) {
      const { sn, entryId, method, args } = body
      const entry = this.ctx.webui.entries[entryId]
      const fn = entry?.data?.[method]
      if (typeof fn !== 'function') {
        this.send({ type: 'rpc:response', body: { sn, ok: false, message: `no such method: ${entryId}.${method}` } })
        return
      }
      try {
        const value = await Reflect.apply(fn, entry, args)
        this.send({ type: 'rpc:response', body: { sn, ok: true, value } })
      } catch (e: any) {
        this.send({ type: 'rpc:response', body: { sn, ok: false, message: e?.message ?? String(e) } })
      }
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

  addEntry<T extends object = never>(files: Entry.Files, data?: T) {
    return new Entry<T>(this.ctx, files, data as T)
  }

  /**
   * Routes baked into the html shell (`@cordisjs/client`'s built-in pages).
   * Override in subclasses if a deployment ships a different shell.
   */
  protected shellPaths: string[] = ['/', '/settings{/*name}']

  matchPath(routePath: string): boolean {
    for (const p of this.shellPaths) {
      if (pathToRegexp(p).regexp.test(routePath)) return true
    }
    for (const entry of Object.values(this.entries)) {
      for (const p of entry.files.routes ?? []) {
        if (pathToRegexp(p).regexp.test(routePath)) return true
      }
    }
    return false
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
