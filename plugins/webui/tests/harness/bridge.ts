import { WebSocket as AbstractWebSocket } from '@cordisjs/plugin-webui'

const { CONNECTING, OPEN, CLOSED } = AbstractWebSocket

type Listener<T> = (event: T) => void

class BridgeSocketImpl implements AbstractWebSocket {
  readyState: number = CONNECTING
  __sent: string[] = []
  __suppressReconnect = false

  peer!: BridgeSocketImpl

  // Frames sent before either side is OPEN are buffered here and flushed
  // when __open() is called. Mirrors the spirit of real WebSocket buffering
  // without throwing on early sends — useful because TestWebUI's [Service.init]
  // calls accept(socket) → Client constructor → socket.send(entry:init) before
  // the harness has a chance to call __open().
  private outbox: string[] = []

  private listeners: {
    open: Set<Listener<AbstractWebSocket.Event>>
    message: Set<Listener<AbstractWebSocket.MessageEvent>>
    close: Set<Listener<AbstractWebSocket.CloseEvent>>
    error: Set<Listener<AbstractWebSocket.ErrorEvent>>
  } = { open: new Set(), message: new Set(), close: new Set(), error: new Set() }

  addEventListener<K extends keyof AbstractWebSocket.EventMap>(
    type: K, listener: (event: AbstractWebSocket.EventMap[K]) => void,
  ): void {
    (this.listeners[type] as Set<any>).add(listener)
  }

  removeEventListener<K extends keyof AbstractWebSocket.EventMap>(
    type: K, listener: (event: AbstractWebSocket.EventMap[K]) => void,
  ): void {
    (this.listeners[type] as Set<any>).delete(listener)
  }

  send(data: string): void {
    if (this.readyState === CLOSED) return
    this.__sent.push(data)
    if (this.readyState !== OPEN) {
      this.outbox.push(data)
      return
    }
    this.deliver(data)
  }

  private deliver(data: string): void {
    const peer = this.peer
    queueMicrotask(() => {
      if (peer.readyState !== OPEN) return
      const event: AbstractWebSocket.MessageEvent = { type: 'message', target: peer, data }
      for (const fn of [...peer.listeners.message]) fn(event)
    })
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === CLOSED) return
    const wasOpen = this.readyState === OPEN
    this.readyState = CLOSED
    if (!this.__suppressReconnect) {
      const event: AbstractWebSocket.CloseEvent = { type: 'close', target: this, code, reason }
      queueMicrotask(() => {
        for (const fn of [...this.listeners.close]) fn(event)
      })
    }
    if (!wasOpen) return
    if (this.__suppressReconnect) {
      this.peer.readyState = CLOSED
      return
    }
    if (this.peer.readyState === OPEN) this.peer.close(code, reason)
  }

  __open(): void {
    if (this.readyState === OPEN) return
    this.readyState = OPEN
    this.peer.readyState = OPEN

    const flush = (sock: BridgeSocketImpl) => {
      const pending = sock.outbox
      sock.outbox = []
      for (const data of pending) sock.deliver(data)
    }
    flush(this)
    flush(this.peer)

    const ev: AbstractWebSocket.Event = { type: 'open', target: this }
    const peerEv: AbstractWebSocket.Event = { type: 'open', target: this.peer }
    queueMicrotask(() => {
      for (const fn of [...this.listeners.open]) fn(ev)
      for (const fn of [...this.peer.listeners.open]) fn(peerEv)
    })
  }
}

export interface BridgeSocket extends AbstractWebSocket {
  __open(): void
  __suppressReconnect: boolean
  __sent: string[]
  readyState: number
}

export interface SocketBridge {
  client: BridgeSocket
  server: BridgeSocket
}

export function createSocketBridge(): SocketBridge {
  const client = new BridgeSocketImpl()
  const server = new BridgeSocketImpl()
  client.peer = server
  server.peer = client
  return { client, server }
}
