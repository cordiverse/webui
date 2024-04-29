import { Context, Logger } from 'cordis'
import { IncomingMessage } from 'node:http'
import { WebSocket } from './types.ts'

const logger = new Logger('webui')

export class Client {
  readonly id = Math.random().toString(36).slice(2)

  constructor(readonly ctx: Context, public socket: WebSocket, public request?: IncomingMessage) {
    socket.addEventListener('message', this.receive)
    const webui = this.ctx.get('webui')!
    const body = { ...webui.entries, _id: webui.id }
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
