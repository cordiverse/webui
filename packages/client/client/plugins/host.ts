import { Context, Fiber, Service } from 'cordis'
import { defineProperty, Dict } from 'cosmokit'
import type { HostSync } from '@cordisjs/webui/shared'

declare module 'cordis' {
  interface Context {
    host: Context
  }
}

function createStub(ctx: Context, name: string) {
  const methods: Dict<(...args: any[]) => Promise<any>> = Object.create(null)
  const isMethod = (prop: string | symbol): prop is string => {
    return typeof prop === 'string' && prop !== 'then' && !prop.startsWith('__') && !(prop in Object.prototype)
  }
  return new Proxy(Object.create(null), {
    get(target, prop) {
      if (!isMethod(prop)) return Reflect.get(target, prop)
      return methods[prop] ??= (...args: any[]) => ctx.client.rpc.invoke(name, prop, args)
    },
  })
}

/**
 * Provide each service of the host as `host:<name>`, so that a plugin which
 * injects it runs while the host provides the service. The services remain
 * while the connection is closed, until the snapshot of the next connection.
 */
export default class HostService {
  /** the services in the latest snapshot */
  private _services = new Set<string>()
  private _fibers: Dict<Fiber> = Object.create(null)
  /** the services whose fibers are being disposed */
  private _disposing = new Set<string>()

  constructor(public ctx: Context) {
    defineProperty(this, Service.tracker, {
      property: 'ctx',
    })

    ctx.reflect.namespace('host')
    ctx.on('host:sync' as any, (body: HostSync) => this.sync(body.services))
  }

  sync(services: string[]) {
    const names = new Set([...this._services, ...services])
    this._services = new Set(services)
    for (const name of names) this._update(name)
  }

  // A service is provided again only after its previous fiber is disposed,
  // which waits for the cleanup of its dependents.
  private _update(name: string) {
    if (this._disposing.has(name)) return
    const fiber = this._fibers[name]
    const expected = this._services.has(name)
    if (expected && !fiber) {
      const stub = createStub(this.ctx, name)
      this._fibers[name] = this.ctx.use({
        name: `host:${name}`,
        apply: (ctx: Context) => {
          ctx.provide(`host:${name}`, stub)
        },
      })
    } else if (!expected && fiber) {
      delete this._fibers[name]
      this._disposing.add(name)
      fiber.dispose().catch((error) => {
        this.ctx.logger.error(error)
      }).finally(() => {
        this._disposing.delete(name)
        this._update(name)
      })
    }
  }
}
