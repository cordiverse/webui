import { Context } from 'cordis'
import { Dict } from 'cosmokit'
import type { HTTP } from '@cordisjs/plugin-http'
import type {} from '@cordisjs/plugin-webui'
import z from 'schemastery'

declare module '@cordisjs/plugin-webui' {
  interface Events {
    'http-webui.clear'(): void
  }
}

export interface HistoryEntry {
  id: number
  ts: number               // request start time (Date.now())
  endTs?: number           // request end time; undefined → still live
  method: string
  url: string
  status: number           // 0 while pending
  statusText: string
  duration: number         // ms; updated live while pending
  size: number
  source?: string
  requestHeaders: Dict<string>
  responseHeaders: Dict<string>
  error?: string
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

  ctx.on('http/fetch', async function (this: HTTP, url, init, httpConfig, next) {
    const startPerf = performance.now()
    const method = String(init.method ?? 'GET').toUpperCase()
    const requestHeaders = headersToDict(init.headers as any)
    const fiber = this?.ctx?.fiber
    const source = fiber ? ctx.get('loader')?.locate(fiber) : undefined

    const record: HistoryEntry = {
      id: ++nextId,
      ts: Date.now(),
      method,
      url: url.toString(),
      status: 0,
      statusText: 'Pending',
      duration: 0,
      size: 0,
      source,
      requestHeaders,
      responseHeaders: {},
    }
    pushRecord(record)

    // throttled patch: size updates can be very frequent during streaming
    let lastRefresh = 0
    function throttledRefresh() {
      const now = performance.now()
      if (now - lastRefresh < 100) return
      lastRefresh = now
      entry.refresh()
    }

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
      if (declaredSize) record.size = declaredSize
      entry.refresh()

      if (!response.body) {
        finalize()
        return response
      }

      let total = 0
      const counter = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          total += chunk.byteLength
          record.size = total
          record.duration = Math.round(performance.now() - startPerf)
          throttledRefresh()
          controller.enqueue(chunk)
        },
        flush() {
          if (total) record.size = total
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

  ctx.webui.addListener('http-webui.clear', () => {
    history.length = 0
    entry.refresh()
  })
}
