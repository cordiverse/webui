/**
 * `WorkerBridgeSocket` — a `BridgeSocket` (from `@cordisjs/plugin-webui`)
 * implemented on top of a `MessagePort`. Replaces the in-process pair-based
 * bridge from `@cordisjs/plugin-webui/createSocketBridge` now that the
 * client and server halves live in different threads.
 *
 * Topology:
 *
 *   main thread                              dedicated Worker
 *   ┌─────────────────────┐                ┌────────────────────┐
 *   │ WorkerBridgeSocket  │ ◀── port1 ──▶ │ WorkerBridgeSocket │
 *   │ (client-side)       │   MessageChan │ (server-side)      │
 *   └─────────────────────┘                └────────────────────┘
 *
 * Each half buffers outgoing sends while `readyState !== OPEN` (mirrors
 * `BridgeSocketImpl`'s behaviour — `WebUI.accept(socket)` synchronously
 * sends `entry:init` before the bridge consumer can call `__open()`).
 * Each half also buffers INCOMING messages while not yet OPEN, because
 * the receiving side may not have attached its `message` listeners yet
 * (`connect()` runs after the worker is spawned).
 *
 * `__open()` is called on each side independently; the pair shares no
 * state across threads, so the synchronisation is "each side opens when
 * its own setup is done" — the message arriving early is held in the
 * receiver's inbox until the receiver opens.
 */

import { WebSocket as AbstractWebSocket } from '@cordisjs/plugin-webui'

const { CONNECTING, OPEN, CLOSED } = AbstractWebSocket

type Listener<T> = (event: T) => void

export class WorkerBridgeSocket implements AbstractWebSocket {
  readyState: number = CONNECTING
  __suppressReconnect = false
  __sent: string[] = []

  private outbox: string[] = []
  private inbox: string[] = []
  private listeners: {
    open: Set<Listener<AbstractWebSocket.Event>>
    message: Set<Listener<AbstractWebSocket.MessageEvent>>
    close: Set<Listener<AbstractWebSocket.CloseEvent>>
    error: Set<Listener<AbstractWebSocket.ErrorEvent>>
  } = { open: new Set(), message: new Set(), close: new Set(), error: new Set() }

  constructor(private port: MessagePort) {
    port.onmessage = (ev: MessageEvent) => {
      const data = ev.data
      // Peer hung up — surface a close event locally. The control envelope
      // (`__bridge_close`) lets us multiplex control + payload on one port
      // without an extra protocol layer.
      if (data && typeof data === 'object' && data.__bridge_close) {
        this.handlePeerClose(data.code ?? 1006, data.reason ?? '')
        return
      }
      if (typeof data !== 'string') return  // ignore anything we don't recognise
      if (this.readyState !== OPEN) {
        this.inbox.push(data)
        return
      }
      this.deliverMessage(data)
    }
    port.start?.()
  }

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
    this.port.postMessage(data)
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === CLOSED) return
    const wasOpen = this.readyState === OPEN
    this.readyState = CLOSED
    if (wasOpen) {
      try {
        this.port.postMessage({ __bridge_close: true, code, reason })
      } catch {
        // peer already gone; ignore
      }
    }
    this.port.close()
    if (!this.__suppressReconnect) {
      const event: AbstractWebSocket.CloseEvent = { type: 'close', target: this, code, reason }
      queueMicrotask(() => {
        for (const fn of [...this.listeners.close]) fn(event)
      })
    }
  }

  /**
   * Flip this side to OPEN. Flushes the outgoing buffer through the port
   * and the incoming buffer to local `message` listeners. Both sides must
   * call this independently; the receiver's inbox keeps things in order
   * until then.
   *
   * Events fire in WebSocket-spec order: `open` first (one microtask),
   * then any buffered `message` events (a second microtask). Reversing
   * these would deliver data before the consumer has finished the
   * "socket just opened" handler.
   */
  __open(): void {
    if (this.readyState === OPEN) return
    this.readyState = OPEN
    const out = this.outbox
    this.outbox = []
    for (const data of out) this.port.postMessage(data)
    const inq = this.inbox
    this.inbox = []
    const ev: AbstractWebSocket.Event = { type: 'open', target: this }
    queueMicrotask(() => {
      for (const fn of [...this.listeners.open]) fn(ev)
    })
    queueMicrotask(() => {
      for (const data of inq) this.deliverMessage(data)
    })
  }

  private deliverMessage(data: string): void {
    const event: AbstractWebSocket.MessageEvent = { type: 'message', target: this, data }
    for (const fn of [...this.listeners.message]) fn(event)
  }

  private handlePeerClose(code: number, reason: string): void {
    if (this.readyState === CLOSED) return
    this.readyState = CLOSED
    this.port.close()
    const event: AbstractWebSocket.CloseEvent = { type: 'close', target: this, code, reason }
    queueMicrotask(() => {
      for (const fn of [...this.listeners.close]) fn(event)
    })
  }
}

/**
 * Boot config carried alongside the port from main → Worker on the
 * initial `postMessage`. Anything the Worker needs that lives in
 * main-thread-only state (localStorage, `location.search`, …) is
 * collected here and shipped once.
 */
export interface BootConfig {
  instanceId?: string
  instancesRoot: string
}

/**
 * Main-thread factory. Creates the channel, transfers `port2` to the
 * Worker as part of an `init` envelope, and wraps `port1` locally.
 */
export function createWorkerSocketBridge(worker: Worker, bootConfig: BootConfig): WorkerBridgeSocket {
  const channel = new MessageChannel()
  worker.postMessage({ __type: 'init', port: channel.port2, bootConfig }, [channel.port2])
  return new WorkerBridgeSocket(channel.port1)
}

/**
 * Worker-thread helper. Awaits the matching `init` envelope from main
 * and resolves with `{ socket, bootConfig }`. Each Worker can call this
 * exactly once at startup.
 */
export function acceptWorkerSocketBridge(): Promise<{ socket: WorkerBridgeSocket; bootConfig: BootConfig }> {
  return new Promise((resolve) => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.__type !== 'init') return
      ;(self as unknown as DedicatedWorkerGlobalScope).removeEventListener('message', onMessage)
      const port = ev.data.port as MessagePort
      const bootConfig = ev.data.bootConfig as BootConfig
      resolve({ socket: new WorkerBridgeSocket(port), bootConfig })
    }
    ;(self as unknown as DedicatedWorkerGlobalScope).addEventListener('message', onMessage)
  })
}
