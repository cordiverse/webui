import { Context } from 'cordis'
import { Dict } from 'cosmokit'
import type { Http } from '@cordisjs/plugin-http'
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
  let nextId = 0

  const entry = ctx.webui.addEntry<Data>({
    path: '@cordisjs/plugin-http-webui/dist',
    base: import.meta.url,
    dev: '../client/index.ts',
    prod: '../dist/manifest.json',
  }, {
    history: [],
    limit: config.historyLimit,
    proxyBaseUrl: ctx.get('server.proxy')!.baseUrl,
  })

  function pushRecord(record: HistoryEntry) {
    entry.mutate((d) => {
      d.history.push(record)
      // TODO: trim oldest with a front-truncate op when supported by muon
    })
  }

  function update(id: number, fn: (record: HistoryEntry) => void) {
    entry.mutate((d) => {
      const record = d.history.find(r => r.id === id)
      if (record) fn(record)
    })
  }

  function makeThrottledUpdate(id: number) {
    let last = 0
    return (fn: (record: HistoryEntry) => void) => {
      const now = performance.now()
      if (now - last < 100) return
      last = now
      update(id, fn)
    }
  }

  ctx.on('http/fetch', async function (this: Http, url, init, _httpConfig, next) {
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

    const throttledUpdate = makeThrottledUpdate(record.id)

    function finalize(fn: (record: HistoryEntry) => void = () => {}) {
      update(record.id, (r) => {
        fn(r)
        r.endTime = Date.now()
      })
    }

    try {
      const response = await next()
      const declaredSize = parseSize(response.headers)
      update(record.id, (r) => {
        r.status = response.status
        r.statusText = response.statusText
        r.responseHeaders = headersToDict(response.headers)
        if (declaredSize) r.bytesIn = declaredSize
      })

      if (!response.body) {
        finalize()
        return response
      }

      let total = 0
      const counter = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          total += chunk.byteLength
          throttledUpdate((r) => { r.bytesIn = total })
          controller.enqueue(chunk)
        },
        flush() {
          finalize((r) => { if (total) r.bytesIn = total })
        },
      })
      return new Response(response.body.pipeThrough(counter), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    } catch (e: any) {
      finalize((r) => {
        r.status = 0
        r.statusText = 'Error'
        r.error = String(e?.message ?? e)
      })
      throw e
    }
  }, { global: true })

  ctx.on('http/websocket', function (this: Http, url, init, _config, next) {
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

    const throttledUpdate = makeThrottledUpdate(record.id)
    let bytesIn = 0
    let bytesOut = sizeOfSent((init as any)?.body) || 0

    const originalSend = socket.send.bind(socket)
    socket.send = function (this: UndiciWebSocket, ...args: any[]) {
      bytesOut += sizeOfSent(args[0])
      throttledUpdate((r) => { r.bytesOut = bytesOut })
      return (originalSend as any)(...args)
    } as typeof socket.send

    socket.addEventListener('message', (event) => {
      bytesIn += sizeOfRecv(event.data)
      throttledUpdate((r) => { r.bytesIn = bytesIn })
    })

    socket.addEventListener('open', () => {
      update(record.id, (r) => {
        r.status = 101
        r.statusText = 'Switching Protocols'
        r.wsStatus = 'open'
      })
    })

    socket.addEventListener('close', (event) => {
      update(record.id, (r) => {
        r.endTime = Date.now()
        if (r.wsStatus === 'connecting') {
          r.wsStatus = 'error'
          r.error = event.reason || 'Connection failed'
        } else {
          r.wsStatus = 'closed'
        }
      })
    })

    return socket
  }, { global: true })

  ctx.webui.addListener('http-webui.clear', () => {
    entry.mutate((d) => {
      d.history.length = 0
    })
  })
}
