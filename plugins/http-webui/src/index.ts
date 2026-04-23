import { Context } from 'cordis'
import { Dict } from 'cosmokit'
import type { HTTP } from '@cordisjs/plugin-http'
import type {} from '@cordisjs/plugin-webui'
import type { WebSocket as UndiciWebSocket } from 'undici'
import z from 'schemastery'

declare module '@cordisjs/plugin-webui' {
  interface Events {
    'http-webui.clear'(): void
  }
}

export interface HistoryEntry {
  id: number
  kind: 'http' | 'ws'
  ts: number               // request start time (Date.now())
  endTs?: number           // request end time; undefined → still live
  method: string
  url: string
  status: number           // 0 while pending
  statusText: string
  duration: number         // ms; updated live while pending
  bytesIn: number          // HTTP response body bytes / WS total recv bytes
  bytesOut: number         // HTTP request body bytes / WS total sent bytes
  source?: string
  requestHeaders: Dict<string>
  responseHeaders: Dict<string>
  error?: string
  wsStatus?: 'connecting' | 'open' | 'closed' | 'error'
}

export interface Data {
  history: HistoryEntry[]
  limit: number
}

export const name = 'http-webui'

export interface Config {
  historyLimit: number
}

export const Config: z<Config> = z.object({
  historyLimit: z.natural().default(500).description('请求历史的最大条数。'),
})

export const inject = ['http', 'webui']

function headersToDict(headers: HeadersInit | Dict<string> | undefined): Dict<string> {
  const result: Dict<string> = {}
  if (!headers) return result
  if (headers instanceof Headers) {
    headers.forEach((v, k) => { result[k] = v })
  } else if (Array.isArray(headers)) {
    for (const [k, v] of headers) result[k] = v
  } else {
    Object.assign(result, headers)
  }
  return result
}

function parseSize(headers: Headers): number {
  const value = headers.get('content-length')
  const parsed = value ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function sizeOfSent(data: any): number {
  if (typeof data === 'string') return new TextEncoder().encode(data).byteLength
  if (data instanceof ArrayBuffer) return data.byteLength
  if (ArrayBuffer.isView(data)) return data.byteLength
  if (data instanceof Blob) return data.size
  return 0
}

function sizeOfRecv(data: any): number {
  if (typeof data === 'string') return new TextEncoder().encode(data).byteLength
  if (data instanceof ArrayBuffer) return data.byteLength
  if (ArrayBuffer.isView(data)) return data.byteLength
  if (data instanceof Blob) return data.size
  return 0
}

export function apply(ctx: Context, config: Config) {
  const history: HistoryEntry[] = []
  let nextId = 0

  const data = (): Data => ({ history, limit: config.historyLimit })

  const entry = ctx.webui.addEntry<Data>({
    path: '@cordisjs/plugin-http-webui/dist',
    base: import.meta.url,
    dev: '../client/index.ts',
    prod: '../dist/manifest.json',
  }, data)

  function pushRecord(record: HistoryEntry) {
    history.push(record)
    while (history.length > config.historyLimit) history.shift()
    entry.refresh()
  }

  function makeThrottledRefresh() {
    let lastRefresh = 0
    return () => {
      const now = performance.now()
      if (now - lastRefresh < 100) return
      lastRefresh = now
      entry.refresh()
    }
  }

  ctx.on('http/fetch', async function (this: HTTP, url, init, httpConfig, next) {
    const startPerf = performance.now()
    const method = String(init.method ?? 'GET').toUpperCase()
    const requestHeaders = headersToDict(init.headers as any)
    const fiber = this?.ctx?.fiber
    const source = fiber ? ctx.get('loader')?.locate(fiber) : undefined

    const record: HistoryEntry = {
      id: ++nextId,
      kind: 'http',
      ts: Date.now(),
      method,
      url: url.toString(),
      status: 0,
      statusText: 'Pending',
      duration: 0,
      bytesIn: 0,
      bytesOut: sizeOfSent(init.body),
      source,
      requestHeaders,
      responseHeaders: {},
    }
    pushRecord(record)

    const throttledRefresh = makeThrottledRefresh()

    function finalize() {
      record.endTs = Date.now()
      record.duration = Math.round(performance.now() - startPerf)
      entry.refresh()
    }

    try {
      const response = await next()
      record.status = response.status
      record.statusText = response.statusText
      record.responseHeaders = headersToDict(response.headers)
      record.duration = Math.round(performance.now() - startPerf)
      const declaredSize = parseSize(response.headers)
      if (declaredSize) record.bytesIn = declaredSize
      entry.refresh()

      if (!response.body) {
        finalize()
        return response
      }

      let total = 0
      const counter = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          total += chunk.byteLength
          record.bytesIn = total
          record.duration = Math.round(performance.now() - startPerf)
          throttledRefresh()
          controller.enqueue(chunk)
        },
        flush() {
          if (total) record.bytesIn = total
          finalize()
        },
      })
      return new Response(response.body.pipeThrough(counter), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    } catch (e: any) {
      record.status = 0
      record.statusText = 'Error'
      record.error = String(e?.message ?? e)
      finalize()
      throw e
    }
  }, { global: true })

  ctx.on('http/websocket', function (this: HTTP, url, init, _config, next) {
    const startPerf = performance.now()
    const requestHeaders = headersToDict(init.headers as any)
    const fiber = this?.ctx?.fiber
    const source = fiber ? ctx.get('loader')?.locate(fiber) : undefined
    const socket = next()
    const record: HistoryEntry = {
      id: ++nextId,
      kind: 'ws',
      ts: Date.now(),
      method: 'WS',
      url: url.toString(),
      status: 0,
      statusText: 'Connecting',
      duration: 0,
      bytesIn: 0,
      bytesOut: 0,
      source,
      requestHeaders,
      responseHeaders: {},
      wsStatus: 'connecting',
    }
    pushRecord(record)

    const throttledRefresh = makeThrottledRefresh()

    const originalSend = socket.send.bind(socket)
    socket.send = function (this: UndiciWebSocket, ...args: any[]) {
      record.bytesOut += sizeOfSent(args[0])
      record.duration = Math.round(performance.now() - startPerf)
      throttledRefresh()
      return (originalSend as any)(...args)
    } as typeof socket.send

    socket.addEventListener('message', (event) => {
      record.bytesIn += sizeOfRecv(event.data)
      record.duration = Math.round(performance.now() - startPerf)
      throttledRefresh()
    })

    socket.addEventListener('open', () => {
      record.status = 101
      record.statusText = 'Switching Protocols'
      record.wsStatus = 'open'
      record.duration = Math.round(performance.now() - startPerf)
      entry.refresh()
    })

    socket.addEventListener('close', (event) => {
      record.endTs = Date.now()
      record.duration = Math.round(performance.now() - startPerf)
      if (record.wsStatus === 'connecting') {
        record.wsStatus = 'error'
        record.error = event.reason || 'Connection failed'
      } else {
        record.wsStatus = 'closed'
      }
      record.status = event.code || (record.status || 1006)
      record.statusText = event.reason || record.statusText
      entry.refresh()
    })

    return socket
  }, { global: true })

  ctx.webui.addListener('http-webui.clear', () => {
    history.length = 0
    entry.refresh()
  })
}
