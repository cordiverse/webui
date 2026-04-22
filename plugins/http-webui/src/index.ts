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
  ts: number
  method: string
  url: string
  status: number
  statusText: string
  latency: number
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

  function push(entryData: HistoryEntry) {
    history.push(entryData)
    while (history.length > config.historyLimit) history.shift()
    entry.refresh()
  }

  ctx.on('http/fetch', async function (this: HTTP, url, init, httpConfig, next) {
    const start = performance.now()
    const method = String(init.method ?? 'GET').toUpperCase()
    const requestHeaders = headersToDict(init.headers as any)
    const fiber = this?.ctx?.fiber
    const source = fiber ? ctx.get('loader')?.locate(fiber) : undefined

    const id = ++nextId
    const ts = Date.now()

    try {
      const response = await next()
      const latency = Math.round(performance.now() - start)
      const record: HistoryEntry = {
        id,
        ts,
        method,
        url: url.toString(),
        status: response.status,
        statusText: response.statusText,
        latency,
        size: parseSize(response.headers),
        source,
        requestHeaders,
        responseHeaders: headersToDict(response.headers),
      }
      push(record)

      if (!record.size && response.body) {
        let total = 0
        const counter = new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            total += chunk.byteLength
            controller.enqueue(chunk)
          },
          flush() {
            record.size = total
            entry.refresh()
          },
        })
        return new Response(response.body.pipeThrough(counter), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        })
      }

      return response
    } catch (e: any) {
      const latency = Math.round(performance.now() - start)
      push({
        id,
        ts,
        method,
        url: url.toString(),
        status: 0,
        statusText: 'Error',
        latency,
        size: 0,
        source,
        requestHeaders,
        responseHeaders: {},
        error: String(e?.message ?? e),
      })
      throw e
    }
  }, { global: true })

  ctx.webui.addListener('http-webui.clear', () => {
    history.length = 0
    entry.refresh()
  })
}
