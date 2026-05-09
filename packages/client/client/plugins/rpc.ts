import { Context, Service } from 'cordis'
import { defineProperty } from 'cosmokit'
import { watch } from 'vue'
import type { RpcResponse } from '@cordisjs/plugin-webui'

interface Pending {
  resolve: (value: any) => void
  reject: (error: Error) => void
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
      else pending.reject(new Error(body.message))
    })

    // Reject all pending RPCs when the socket goes away (reconnect, manual close, etc.)
    ctx.effect(() => watch(ctx.client.socket, (value) => {
      if (value) return
      const error = new Error('socket disconnected')
      for (const [, pending] of this._pending) pending.reject(error)
      this._pending.clear()
    }))
  }

  call(entryId: string, method: string, args: any[]): Promise<any> {
    const socket = this.ctx.client.socket.value
    if (!socket) return Promise.reject(new Error('socket not connected'))
    const sn = ++this._sn
    return new Promise((resolve, reject) => {
      this._pending.set(sn, { resolve, reject })
      socket.send(JSON.stringify({
        type: 'rpc:request',
        body: { sn, entryId, method, args },
      }))
    })
  }
}
