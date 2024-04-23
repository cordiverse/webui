import { Context, Logger } from 'cordis'
import { WebSocket } from './types'
import { DataService } from './service'
import { IncomingMessage } from 'node:http'

const logger = new Logger('console')

export function coerce(val: any) {
  // resolve error when stack is undefined, e.g. axios error with status code 401
  const { message, stack } = val instanceof Error && val.stack ? val : new Error(val as any)
  const lines = stack.split('\n')
  const index = lines.findIndex(line => line.endsWith(message))
  return lines.slice(index).join('\n')
}

export class Client {
  readonly id = Math.random().toString(36).slice(2)

  constructor(readonly ctx: Context, public socket: WebSocket, public request?: IncomingMessage) {
    socket.addEventListener('message', this.receive)
    ctx.on('dispose', () => {
      socket.removeEventListener('message', this.receive)
    })
    this.refresh()
  }

  send(payload: any) {
    this.socket.send(JSON.stringify(payload))
  }

  receive = async (data: WebSocket.MessageEvent) => {
    const { type, args, id } = JSON.parse(data.data.toString())
    const listener = this.ctx.get('console').listeners[type]
    if (!listener) {
      logger.info('unknown message:', type, ...args)
      return this.send({ type: 'response', body: { id, error: 'not implemented' } })
    }

    if (await this.ctx.serial('console/intercept', this, listener)) {
      return this.send({ type: 'response', body: { id, error: 'unauthorized' } })
    }

    try {
      const value = await listener.callback.call(this, ...args)
      return this.send({ type: 'response', body: { id, value } })
    } catch (e) {
      logger.debug(e)
      const error = coerce(e)
      return this.send({ type: 'response', body: { id, error } })
    }
  }

  refresh() {
    Object.keys(this.ctx.root[Context.internal]).forEach(async (name) => {
      if (!name.startsWith('console.services.')) return
      const key = name.slice(17)
      const service = this.ctx.get(name) as DataService
      if (!service) return
      if (await this.ctx.serial('console/intercept', this, service.options)) {
        return this.send({ type: 'data', body: { key, value: null } })
      }

      try {
        const value = await service.get(false, this)
        if (!value) return
        this.send({ type: 'data', body: { key, value } })
      } catch (error) {
        logger.warn(error)
      }
    })
  }
}
