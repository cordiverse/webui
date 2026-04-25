import { Context } from 'cordis'
import { Dict } from 'cosmokit'
import type { HTTP } from '@cordisjs/plugin-http'
import type {} from '@cordisjs/plugin-webui'
import type {} from '@cordisjs/plugin-server-proxy'
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
  startTime: number        // request start time (Date.now())
  endTime?: number         // request end time; undefined → still live
  method: string
  url: string
  status: number           // 0 while pending
  statusText: string
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
  proxyBaseUrl: string
}

export const name = 'http-webui'

export interface Config {
  historyLimit: number
}

export const Config: z<Config> = z.object({
  historyLimit: z.natural().default(500).description('请求历史的最大条数。'),
})

export const inject = ['http', 'webui', 'server.proxy']

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

  const data = (): Data => ({
    history,
    limit: config.historyLimit,
    proxyBaseUrl: ctx.get('server.proxy')!.baseUrl,
  })

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

  ctx.on('http/fetch', async function (this: HTTP, url, init, _httpConfig, next) {
    const method = String(init.method ?? 'GET').toUpperCase()
    const requestHeaders = headersToDict(init.headers as any)
    const fiber = this?.ctx?.fiber
    const source = fiber ? ctx.get('loader')?.locate(fiber) : undefined

    const record: HistoryEntry = {
      id: ++nextId,
      kind: 'http',
      startTime: Date.now(),
      method,
      url: url.toString(),
      status: 0,
      statusText: 'Pending',
      bytesIn: 0,
      bytesOut: sizeOfSent(init.body),
      source,
      requestHeaders,
      responseHeaders: {},
    }
    pushRecord(record)

    const throttledRefresh = makeThrottledRefresh()

    function finalize() {
      record.endTime = Date.now()
      entry.refresh()
    }

    try {
      const response = await next()
      record.status = response.status
      record.statusText = response.statusText
      record.responseHeaders = headersToDict(response.headers)
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
    const requestHeaders = headersToDict(init.headers as any)
    const fiber = this?.ctx?.fiber
    const source = fiber ? ctx.get('loader')?.locate(fiber) : undefined
    const socket = next()
    const record: HistoryEntry = {
      id: ++nextId,
      kind: 'ws',
      startTime: Date.now(),
      method: 'WS',
      url: url.toString(),
      status: 0,
      statusText: 'Connecting',
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
      throttledRefresh()
      return (originalSend as any)(...args)
    } as typeof socket.send

    socket.addEventListener('message', (event) => {
      record.bytesIn += sizeOfRecv(event.data)
      throttledRefresh()
    })

    socket.addEventListener('open', () => {
      record.status = 101
      record.statusText = 'Switching Protocols'
      record.wsStatus = 'open'
      entry.refresh()
    })

    socket.addEventListener('close', (event) => {
      record.endTime = Date.now()
      if (record.wsStatus === 'connecting') {
        record.wsStatus = 'error'
        record.error = event.reason || 'Connection failed'
      } else {
        record.wsStatus = 'closed'
      }
      entry.refresh()
    })

    return socket
  }, { global: true })

  ctx.webui.addListener('http-webui.clear', () => {
    history.length = 0
    entry.refresh()
  })
}
