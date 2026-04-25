import { Context } from 'cordis'
import { Dict, Time } from 'cosmokit'
import type Server from '@cordisjs/plugin-server'
import type {} from '@cordisjs/plugin-webui'
import z from 'schemastery'

declare module '@cordisjs/plugin-webui' {
  interface Events {
    'server-webui.clear'(): void
  }
}

export interface ServerRoute {
  id: string
  method: string
  path: string
  interceptPath?: string
  plugin?: string
  requests: number
  totalLatency: number
  avgLatency: number
  lastStatus?: number
}

export interface ServerRequest {
  id: number
  ts: number
  method: string
  path: string
  status: number
  latency: number
  bytesIn?: number
  bytesOut?: number
  remote?: string
  route?: string
  plugin?: string
}

export interface Stats {
  totalRoutes: number
  requestsLastHour: number
  avgLatency: number
  errorRate: number
}

export interface Data {
  listening: boolean
  host: string
  port: number
  baseUrl: string
  routes: ServerRoute[]
  requests: ServerRequest[]
  stats: Stats
  requestLimit: number
}

export const name = 'server-webui'

export interface Config {
  requestLimit: number
}

export const Config: z<Config> = z.object({
  requestLimit: z.natural().default(500).description('请求历史的最大条数。'),
})

export const inject = ['server', 'webui']

function routeKey(method: string, path: string | RegExp, interceptPath?: string) {
  const p = typeof path === 'string' ? path : path.toString()
  return `${method.toUpperCase()} ${interceptPath ?? ''}${p}`
}

function stringifyPath(path: string | RegExp) {
  return typeof path === 'string' ? path : path.toString()
}

function resolvePlugin(ctx: Context, route: any): string | undefined {
  const fiber = route.fiber
  if (!fiber) return
  return ctx.get('loader')?.locate(fiber) ?? undefined
}

export function apply(ctx: Context, config: Config) {
  const server: Server = ctx.server
  const stats = new Map<string, ServerRoute>()
  const requests: ServerRequest[] = []
  let nextRequestId = 0

  function snapshotRoutes(): ServerRoute[] {
    const out: ServerRoute[] = []
    for (const route of server.httpRoutes) {
      const interceptPath = route.config?.path || undefined
      const key = routeKey(route.method, route.path, interceptPath)
      const prior = stats.get(key)
      out.push({
        id: key,
        method: route.method.toUpperCase(),
        path: stringifyPath(route.path),
        interceptPath,
        plugin: resolvePlugin(ctx, route),
        requests: prior?.requests ?? 0,
        totalLatency: prior?.totalLatency ?? 0,
        avgLatency: prior?.avgLatency ?? 0,
        lastStatus: prior?.lastStatus,
      })
    }
    for (const route of server.wsRoutes) {
      const interceptPath = route.config?.path || undefined
      const key = routeKey('WS', route.path, interceptPath)
      const prior = stats.get(key)
      out.push({
        id: key,
        method: 'WS',
        path: stringifyPath(route.path),
        interceptPath,
        plugin: resolvePlugin(ctx, route),
        requests: prior?.requests ?? 0,
        totalLatency: prior?.totalLatency ?? 0,
        avgLatency: prior?.avgLatency ?? 0,
        lastStatus: prior?.lastStatus,
      })
    }
    return out
  }

  function computeStats(): Stats {
    const now = Date.now()
    const horizon = now - Time.hour
    let count = 0
    let errors = 0
    let totalLatency = 0
    for (const req of requests) {
      if (req.ts < horizon) continue
      count++
      totalLatency += req.latency
      if (req.status >= 400 || req.status === 0) errors++
    }
    return {
      totalRoutes: server.httpRoutes.length + server.wsRoutes.length,
      requestsLastHour: count,
      avgLatency: count ? Math.round(totalLatency / count) : 0,
      errorRate: count ? errors / count : 0,
    }
  }

  const entry = ctx.webui.addEntry<Data>({
    path: '@cordisjs/plugin-server-webui/dist',
    base: import.meta.url,
    dev: '../client/index.ts',
    prod: '../dist/manifest.json',
  }, () => ({
    listening: Boolean(server.host && server.port),
    host: server.host ?? '',
    port: server.port ?? 0,
    baseUrl: server.baseUrl ?? '',
    routes: snapshotRoutes(),
    requests: [...requests],
    stats: computeStats(),
    requestLimit: config.requestLimit,
  }))

  function pushRequest(req: ServerRequest, matchedKey?: string) {
    requests.push(req)
    while (requests.length > config.requestLimit) requests.shift()

    if (matchedKey) {
      const existing = stats.get(matchedKey) ?? {
        id: matchedKey,
        method: req.method,
        path: req.route ?? req.path,
        requests: 0,
        totalLatency: 0,
        avgLatency: 0,
      } as ServerRoute
      existing.requests += 1
      existing.totalLatency += req.latency
      existing.avgLatency = Math.round(existing.totalLatency / existing.requests)
      existing.lastStatus = req.status
      stats.set(matchedKey, existing)
    }

    entry.refresh()
  }

  function findMatchedRoute(req: any) {
    for (const route of server.httpRoutes) {
      if (route.method !== 'all' && req.method.toLowerCase() !== route.method) continue
      if (!route.check(req)) continue
      const interceptPath = route.config?.path || undefined
      return {
        key: routeKey(route.method, route.path, interceptPath),
        path: stringifyPath(route.path),
        plugin: resolvePlugin(ctx, route),
      }
    }
    return undefined
  }

  ctx.on('server/request', async (req, res, next) => {
    const start = performance.now()
    let matched: ReturnType<typeof findMatchedRoute>
    try {
      matched = findMatchedRoute(req)
    } catch {}

    const contentLength = (req as any)._req?.headers?.['content-length']
    const bytesIn = contentLength ? parseInt(contentLength, 10) || undefined : undefined

    try {
      await next()
    } finally {
      const latency = Math.round(performance.now() - start)
      let bytesOut: number | undefined
      if (res.body) {
        if (typeof res.body === 'string') {
          bytesOut = Buffer.byteLength(res.body)
        } else if (res.body instanceof Buffer || res.body instanceof Uint8Array) {
          bytesOut = res.body.byteLength
        }
      }
      pushRequest({
        id: ++nextRequestId,
        ts: Date.now(),
        method: req.method.toUpperCase(),
        path: req.path,
        status: res.status ?? 0,
        latency,
        bytesIn,
        bytesOut,
        remote: (req as any).headers?.['x-forwarded-for']?.toString().split(',')[0]?.trim()
          || (req as any)._req?.socket?.remoteAddress
          || undefined,
        route: matched?.path,
        plugin: matched?.plugin,
      }, matched?.key)
    }
  })

  ctx.webui.addListener('server-webui.clear', () => {
    requests.length = 0
    stats.clear()
    entry.refresh()
  })

  const refreshInterval = setInterval(() => entry.refresh(), 5000)
  ctx.effect(() => () => clearInterval(refreshInterval))

  ctx.on('server/ready', () => entry.refresh())
}
