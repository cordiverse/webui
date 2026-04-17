import { Context } from 'cordis'
import { WebSocket } from './types.ts'
import { mapValues } from 'cosmokit'
import { EntryInit } from '../../shared'

export class Client {
  readonly id = Math.random().toString(36).slice(2)

  constructor(readonly ctx: Context, public socket: WebSocket) {
    socket.addEventListener('message', this.receive)
    const webui = this.ctx.get('webui')!
    const body: EntryInit = {
      entries: mapValues(webui.entries, entry => entry.toJSON(this)!),
      serverId: webui.id,
      clientId: this.id,
    }
    this.send({ type: 'entry:init', body })
  }

  send(payload: any) {
    this.socket.send(JSON.stringify(payload))
  }

  receive = async (data: WebSocket.MessageEvent) => {
    const { type, body } = JSON.parse(data.data.toString())
    const listener = this.ctx.get('webui')!.listeners[type]
    if (!listener) {
      this.ctx.logger.info('receive unknown message:', type, body)
      return
    }
    return listener.call(this, body)
  }
}
