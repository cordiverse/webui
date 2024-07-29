import { Context, Logger } from 'cordis'
import { IncomingMessage } from 'node:http'
import { WebSocket } from './types.ts'
import { mapValues } from 'cosmokit'
import { Entry } from './entry.ts'

const logger = new Logger('webui')

export interface ClientEvents {
  'entry:init'(data: Entry.Init): void
  'entry:update'(data: Entry.Update): void
  'entry:patch'(data: Entry.Patch): void
}

export class Client {
  readonly id = Math.random().toString(36).slice(2)

  constructor(readonly ctx: Context, public socket: WebSocket, public request?: IncomingMessage) {
    socket.addEventListener('message', this.receive)
    const webui = this.ctx.get('webui')!
    const body: Entry.Init = {
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
      logger.info('unknown message:', type, body)
      return
    }
    return listener.call(this, body)
  }
}
