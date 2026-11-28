import { Context, Service } from 'cordis'
import { defineProperty } from 'cosmokit'
import { watch } from 'vue'
import type { RpcRequest, RpcResponse, RpcStep } from '@cordisjs/webui/shared'

/** the marker of an expression on a service of the host */
export const kChain = Symbol('cordis.client.chain')

// A function, or an expression that has not been awaited, cannot be sent.
function checkArgument(key: string, value: any) {
  if (value?.[kChain]) {
    throw new TypeError('cannot send an expression on a host service, await it first')
  }
  if (typeof value === 'function') {
    throw new TypeError('cannot send a function')
  }
  return value
}

interface Pending {
  resolve: (value: any) => void
  reject: (error: Error) => void
}

/** A failure of a call, with the `code` that the host reports, if any. */
export class RpcError extends Error {
  constructor(message: string, public code?: string) {
    super(message)
  }
}

export default class RpcService {
  private _sn = 0
  private _pending = new Map<number, Pending>()

  constructor(public ctx: Context) {
    defineProperty(this, Service.tracker, {
      property: 'ctx',
    })

    ctx.on('rpc:response' as any, (body: RpcResponse) => {
      const pending = this._pending.get(body.sn)
      if (!pending) return
      this._pending.delete(body.sn)
      if (body.ok) pending.resolve(body.value)
      else pending.reject(new RpcError(body.message, body.code))
    })

    // Reject all pending RPCs when the socket goes away (reconnect, manual close, etc.)
    ctx.effect(() => watch(ctx.client.socket, (value) => {
      if (value) return
      const error = new Error('socket disconnected')
      for (const [, pending] of this._pending) pending.reject(error)
      this._pending.clear()
    }))
  }

  /** Call a method of the data of an entry. */
  call(entryId: string, method: string, args: any[]): Promise<any> {
    return this.request({ entryId, method, args })
  }

  /** Evaluate an expression on a service of the host. */
  invoke(service: string, chain: RpcStep[]): Promise<any> {
    return this.request({ service, chain })
  }

  request(target: RpcRequest extends infer R ? R extends any ? Omit<R, 'sn'> : never : never): Promise<any> {
    const socket = this.ctx.client.socket.value
    if (!socket) return Promise.reject(new Error('socket not connected'))
    const sn = ++this._sn
    let payload: string
    try {
      payload = JSON.stringify({ type: 'rpc:request', body: { sn, ...target } }, checkArgument)
    } catch (error) {
      return Promise.reject(error)
    }
    return new Promise((resolve, reject) => {
      this._pending.set(sn, { resolve, reject })
      socket.send(payload)
    })
  }
}
