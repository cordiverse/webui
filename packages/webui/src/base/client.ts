import { Context } from 'cordis'
import { WebSocket } from './types.ts'
import { mapValues } from 'cosmokit'
import type { EntryInit, HostSync, RpcResponse } from '../../shared/index.d.ts'

export class Client {
  readonly id = Math.random().toString(36).slice(2)

  constructor(readonly ctx: Context, public socket: WebSocket) {
    socket.addEventListener('message', this.receive)
    const body: EntryInit = {
      entries: mapValues(this.ctx.webui.entries, entry => entry.toJSON()!),
      version: this.ctx.webui.version,
    }
    this.send({ type: 'entry:init', body })
    this.send({ type: 'host:sync', body: { services: this.ctx.webui.getHostServices() } satisfies HostSync })
  }

  send(payload: any) {
    this.socket.send(JSON.stringify(payload))
  }

  /** Send the result of a call. A value that cannot be serialized fails the call. */
  respond(body: RpcResponse) {
    let payload: string
    try {
      payload = JSON.stringify({ type: 'rpc:response', body })
    } catch (e: any) {
      payload = JSON.stringify({
        type: 'rpc:response',
        body: { sn: body.sn, ok: false, message: `cannot serialize the result: ${e?.message ?? e}` },
      })
    }
    this.socket.send(payload)
  }

  receive = async (data: WebSocket.MessageEvent) => {
    const { type, body } = JSON.parse(data.data.toString())
    const listener = this.ctx.webui.listeners[type]
    if (!listener) {
      this.ctx.logger.info('receive unknown message:', type, body)
      return
    }
    return listener.call(this, body)
  }
}
