import { Context } from 'cordis'
import { Dict } from 'cosmokit'
import type {} from '@cordisjs/plugin-http'
import type {} from '@cordisjs/plugin-webui'
import z from 'schemastery'

declare module '@cordisjs/plugin-webui' {
  interface Events {
    'http-webui.compose'(request: ComposeRequest): Promise<ComposeResponse>
    'http-webui.clear'(): void
  }
}

const MAX_BODY_SIZE = 64 * 1024

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
  requestBody?: string
  requestBodyTruncated?: boolean
  responseHeaders: Dict<string>
  responseBody?: string
  responseBodyTruncated?: boolean
  error?: string
}

export interface ComposeRequest {
  method: string
  url: string
  headers?: Dict<string>
  body?: string
  query?: Dict<string>
}

export interface ComposeResponse {
  status: number
  statusText: string
  headers: Dict<string>
  body: string
  bodyTruncated?: boolean
  latency: number
  size: number
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

function stringifyBody(body: any): string | undefined {
  if (body === undefined || body === null) return
  if (typeof body === 'string') return body
  if (body instanceof URLSearchParams) return body.toString()
  if (body instanceof ArrayBuffer) return `[ArrayBuffer ${body.byteLength} bytes]`
  if (ArrayBuffer.isView(body)) return `[${body.constructor.name} ${body.byteLength} bytes]`
  if (body instanceof Blob) return `[Blob ${body.size} bytes]`
  if (body instanceof FormData) return '[FormData]'
  if (body instanceof ReadableStream) return '[ReadableStream]'
  try {
    return JSON.stringify(body)
  } catch {
    return String(body)
  }
}

function truncate(text: string | null | undefined): { body: string, truncated: boolean } {
  const s = text ?? ''
  if (s.length <= MAX_BODY_SIZE) return { body: s, truncated: false }
  return { body: s.slice(0, MAX_BODY_SIZE), truncated: true }
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

  ctx.on('http/fetch', async (url, init, httpConfig, next) => {
    const start = performance.now()
    const method = String(init.method ?? 'GET').toUpperCase()
    const requestHeaders = headersToDict(init.headers as any)
    const rawRequestBody = stringifyBody(init.body as any)
    const requestTrunc = rawRequestBody ? truncate(rawRequestBody) : undefined
    // TODO: attribute source plugin (fiber/ctx attribution through HTTP service tracker)
    const source: string | undefined = undefined

    const id = ++nextId
    const ts = Date.now()

    try {
      const response = await next()
      const latency = Math.round(performance.now() - start)
      let buf: ArrayBuffer
      try {
        buf = await response.arrayBuffer()
      } catch {
        buf = new ArrayBuffer(0)
      }
      const size = buf.byteLength
      let text = ''
      try {
        // decode only for logging; raw bytes preserved in `buf`
        text = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, MAX_BODY_SIZE * 4))
      } catch {}
      const { body, truncated } = truncate(text)
      push({
        id,
        ts,
        method,
        url: url.toString(),
        status: response.status,
        statusText: response.statusText,
        latency,
        size,
        source,
        requestHeaders,
        requestBody: requestTrunc?.body,
        requestBodyTruncated: requestTrunc?.truncated,
        responseHeaders: headersToDict(response.headers),
        responseBody: body,
        responseBodyTruncated: truncated,
      })
      const forwardedHeaders = new Headers(response.headers)
      forwardedHeaders.delete('content-encoding')
      forwardedHeaders.delete('content-length')
      return new Response(buf, {
        status: response.status,
        statusText: response.statusText,
        headers: forwardedHeaders,
      })
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
        requestBody: requestTrunc?.body,
        requestBodyTruncated: requestTrunc?.truncated,
        responseHeaders: {},
        error: String(e?.message ?? e),
      })
      throw e
    }
  }, { global: true })

  ctx.webui.addListener('http-webui.compose', async (request) => {
    const start = performance.now()
    try {
      const response = await ctx.http(request.url, {
        method: request.method as any,
        headers: request.headers,
        data: request.body,
        params: request.query,
        responseType: 'text',
        validateStatus: () => true,
      })
      const latency = Math.round(performance.now() - start)
      const raw = response.data
      const text = raw == null
        ? ''
        : typeof raw === 'string'
          ? raw
          : (() => { try { return JSON.stringify(raw) ?? '' } catch { return String(raw) } })()
      const size = new Blob([text]).size
      const { body, truncated } = truncate(text)
      return {
        status: response.status,
        statusText: response.statusText,
        headers: headersToDict(response.headers),
        body,
        bodyTruncated: truncated,
        latency,
        size,
      }
    } catch (e: any) {
      const latency = Math.round(performance.now() - start)
      return {
        status: 0,
        statusText: 'Error',
        headers: {},
        body: '',
        latency,
        size: 0,
        error: String(e?.message ?? e),
      }
    }
  })

  ctx.webui.addListener('http-webui.clear', () => {
    history.length = 0
    entry.refresh()
  })
}
