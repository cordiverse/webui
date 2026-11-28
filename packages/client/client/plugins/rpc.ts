import { Context, Service } from 'cordis'
import { defineProperty } from 'cosmokit'
import { watch } from 'vue'
import type { RpcRequest, RpcResponse } from '@cordisjs/webui/shared'

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

  /** Call a method of a service of the host. */
  invoke(service: string, method: string, args: any[]): Promise<any> {
    return this.request({ service, method, args })
  }

  request(target: Omit<RpcRequest, 'sn'>): Promise<any> {
    const socket = this.ctx.client.socket.value
    if (!socket) return Promise.reject(new Error('socket not connected'))
    const sn = ++this._sn
    return new Promise((resolve, reject) => {
      this._pending.set(sn, { resolve, reject })
      socket.send(JSON.stringify({
        type: 'rpc:request',
        body: { sn, ...target },
      }))
    })
  }
}
