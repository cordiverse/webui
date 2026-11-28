import { Context, Service } from 'cordis'
import { Dict } from 'cosmokit'
import { pathToRegexp } from 'path-to-regexp'
import { Client } from './client.ts'
import { Entry } from './entry.ts'
import { WebSocket } from './types.ts'
import type { HostSync, RpcRequest, RpcStep } from '../../shared/index.d.ts'

export * from './client.ts'
export * from './entry.ts'
export * from './types.ts'

/** A failure of a call, whose `code` is sent to the client. */
export class RpcError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

function isObject(value: unknown): value is object {
  return typeof value === 'function' || typeof value === 'object' && value !== null
}

// Evaluate the steps of an expression in order, awaiting the value of each
// step. A call receives the value of the preceding read as `this`.
async function evaluate(value: any, chain: RpcStep[]) {
  let thisArg: any
  for (const step of chain) {
    if (Array.isArray(step)) {
      if (typeof value !== 'function') {
        throw new RpcError('method-unavailable', 'the value is not a function')
      }
      value = await Reflect.apply(value, thisArg, step)
      thisArg = undefined
    } else if (typeof step === 'object' && step !== null) {
      if (typeof value !== 'function' || !Array.isArray(step.new)) {
        throw new RpcError('method-unavailable', 'the value is not a constructor')
      }
      value = await Reflect.construct(value, step.new)
      thisArg = undefined
    } else {
      // a member of `Object.prototype`, such as `constructor`, is not read
      if (typeof step !== 'string' || step in Object.prototype) {
        throw new RpcError('member-unavailable', `cannot read "${step}"`)
      }
      if (value === null || value === undefined) {
        throw new RpcError('member-unavailable', `cannot read "${step}" of ${value}`)
      }
      thisArg = value
      value = await value[step]
    }
  }
  if (typeof value?.[Symbol.asyncIterator] === 'function') {
    return Array.fromAsync(value)
  }
  return value
}

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

  private _hostServices = ''

  constructor(public ctx: Context) {
    super(ctx, 'webui')
    this.listeners.ping = function () {
      this.send({ type: 'pong' })
    }
    this.listeners['rpc:request'] = async function (this: Client, body: RpcRequest) {
      const { sn } = body
      try {
        const value = await this.ctx.webui.invoke(body)
        this.respond({ sn, ok: true, value })
      } catch (e: any) {
        const code = typeof e?.code === 'string' ? e.code : undefined
        this.respond({ sn, ok: false, message: e?.message ?? String(e), code })
      }
    }

    // synchronized at most once per tick
    let scheduled = false
    ctx.on('internal/service', (name) => {
      if (scheduled || name.startsWith('host:')) return
      scheduled = true
      queueMicrotask(() => {
        scheduled = false
        const services = this.getHostServices()
        const key = services.join('\n')
        if (key === this._hostServices) return
        this._hostServices = key
        this.broadcast('host:sync', { services } satisfies HostSync)
      })
    })
  }

  /**
   * The names of the services that an active fiber provides in this context,
   * except `host:*`, under which the client provides these services. A value
   * is read at each call, as `ctx.set()` does not notify its change.
   */
  getHostServices() {
    const names: string[] = []
    const { store } = this.ctx.reflect
    for (const key of Reflect.ownKeys(store) as symbol[]) {
      const impl = store[key]
      if (this.isHostService(impl.name)) names.push(impl.name)
    }
    return [...new Set(names)].sort()
  }

  private isHostService(name: string) {
    if (name.startsWith('host:')) return false
    return !!this.ctx.reflect._getImpl(name)
  }

  async invoke(body: RpcRequest) {
    if ('service' in body) {
      const { service, chain } = body
      const target = this.isHostService(service) ? this.ctx.reflect.get(service) : undefined
      if (!isObject(target)) {
        throw new RpcError('service-unavailable', `service "${service}" is unavailable`)
      }
      return await evaluate(target, Array.isArray(chain) ? chain : [])
    }
    const { entryId, method } = body
    const args = Array.isArray(body.args) ? body.args : []
    const entry = typeof entryId === 'string' ? this.entries[entryId] : undefined
    const fn = entry?.data?.[method]
    if (typeof fn !== 'function') {
      throw new RpcError('method-unavailable', `no such method: ${entryId}.${method}`)
    }
    return await Reflect.apply(fn, entry, args)
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

  /** Reload the manifest of `entry` when its file changes. Called once the entry is initialized. */
  watchManifest(entry: Entry) {}

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
