import { Context } from 'cordis'
import type Server from '@cordisjs/plugin-server'
import type {} from '@cordisjs/plugin-timer'
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
  startTime: number
  endTime?: number
  method: string
  path: string
  status: number
  bytesIn?: number
  bytesOut?: number
  remote?: string
  route?: string
  plugin?: string
}

export interface Data {
  listening: boolean
  host: string
  port: number
  baseUrl: string
  routes: Record<string, ServerRoute>
  requests: ServerRequest[]
  requestLimit: number
}

export const name = 'server-webui'

export interface Config {
  requestLimit: number
}

export const Config: z<Config> = z.object({
  requestLimit: z.natural().default(500).description('请求历史的最大条数。'),
})

export const inject = ['server', 'timer', 'webui']

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
  let nextRequestId = 0

  // Build the current routes dict keyed by routeKey. Existing stats (per-route
  // aggregates) are preserved across rebuilds so delta payloads only contain
  // what actually changed.
  function collectRoutes(prior: Record<string, ServerRoute>): Record<string, ServerRoute> {
    const out: Record<string, ServerRoute> = {}
    for (const route of server.httpRoutes) {
      const interceptPath = route.config?.path || undefined
      const key = routeKey(route.method, route.path, interceptPath)
      const p = prior[key]
      out[key] = {
        id: key,
        method: route.method.toUpperCase(),
        path: stringifyPath(route.path),
        interceptPath,
        plugin: resolvePlugin(ctx, route),
        requests: p?.requests ?? 0,
        totalLatency: p?.totalLatency ?? 0,
        avgLatency: p?.avgLatency ?? 0,
        lastStatus: p?.lastStatus,
      }
    }
    for (const route of server.wsRoutes) {
      const interceptPath = route.config?.path || undefined
      const key = routeKey('WS', route.path, interceptPath)
      const p = prior[key]
      out[key] = {
        id: key,
        method: 'WS',
        path: stringifyPath(route.path),
        interceptPath,
        plugin: resolvePlugin(ctx, route),
        requests: p?.requests ?? 0,
        totalLatency: p?.totalLatency ?? 0,
        avgLatency: p?.avgLatency ?? 0,
        lastStatus: p?.lastStatus,
      }
    }
    return out
  }

  const entry = ctx.webui.addEntry<Data>({
    path: '@cordisjs/plugin-server-webui/dist',
    base: import.meta.url,
    dev: '../client/index.ts',
    prod: '../dist/manifest.json',
  }, {
    listening: Boolean(server.host && server.port),
    host: server.host ?? '',
    port: server.port ?? 0,
    baseUrl: server.baseUrl ?? '',
    routes: collectRoutes({}),
    requests: [],
    requestLimit: config.requestLimit,
  })

  function refreshNetwork() {
    entry.mutate((d) => {
      const listening = Boolean(server.host && server.port)
      const host = server.host ?? ''
      const port = server.port ?? 0
      const baseUrl = server.baseUrl ?? ''
      if (d.listening !== listening) d.listening = listening
      if (d.host !== host) d.host = host
      if (d.port !== port) d.port = port
      if (d.baseUrl !== baseUrl) d.baseUrl = baseUrl
    })
  }

  // Keyed-diff routes so unchanged entries don't produce any delta.
  const refreshRoutes = ctx.debounce(() => {
    const next = collectRoutes(entry.data.routes)
    entry.mutate((d) => {
      // remove routes that disappeared
      for (const key of Object.keys(d.routes)) {
        if (!(key in next)) delete d.routes[key]
      }
      // add/update routes
      for (const key in next) {
        const incoming = next[key]
        const current = d.routes[key]
        if (!current) {
          d.routes[key] = incoming
          continue
        }
        // field-level diff; aggregates live here and only touch when finalize changes them
        if (current.method !== incoming.method) current.method = incoming.method
        if (current.path !== incoming.path) current.path = incoming.path
        if (current.interceptPath !== incoming.interceptPath) current.interceptPath = incoming.interceptPath
        if (current.plugin !== incoming.plugin) current.plugin = incoming.plugin
      }
    })
  }, 0)

  ctx.on('internal/plugin', refreshRoutes)

  function pushRequest(req: ServerRequest) {
    entry.mutate((d) => {
      d.requests.push(req)
      // TODO: front-truncate once muon supports it; for now the array grows
      // until clear().
    })
  }

  function updateRequest(id: number, fn: (r: ServerRequest) => void) {
    entry.mutate((d) => {
      const r = d.requests.find((x) => x.id === id)
      if (r) fn(r)
    })
  }

  function bumpRouteAggregates(req: ServerRequest, key: string) {
    entry.mutate((d) => {
      const route = d.routes[key]
      if (!route) return
      route.requests += 1
      route.totalLatency += (req.endTime ?? req.startTime) - req.startTime
      route.avgLatency = Math.round(route.totalLatency / route.requests)
      route.lastStatus = req.status
    })
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
    let matched: ReturnType<typeof findMatchedRoute>
    try {
      matched = findMatchedRoute(req)
    } catch {}

    const contentLength = (req as any)._req?.headers?.['content-length']
    const bytesIn = contentLength ? parseInt(contentLength, 10) || undefined : undefined

    const reqEntry: ServerRequest = {
      id: ++nextRequestId,
      startTime: Date.now(),
      method: req.method.toUpperCase(),
      path: req.path,
      status: 0,
      bytesIn,
      remote: (req as any).headers?.['x-forwarded-for']?.toString().split(',')[0]?.trim()
        || (req as any)._req?.socket?.remoteAddress
        || undefined,
      route: matched?.path,
      plugin: matched?.plugin,
    }
    pushRequest(reqEntry)

    try {
      await next()
    } finally {
      let bytesOut: number | undefined
      if (res.body) {
        if (typeof res.body === 'string') {
          bytesOut = Buffer.byteLength(res.body)
        } else if (res.body instanceof Buffer || res.body instanceof Uint8Array) {
          bytesOut = res.body.byteLength
        }
      }
      const endTime = Date.now()
      const status = res.status ?? 0
      updateRequest(reqEntry.id, (r) => {
        r.endTime = endTime
        r.status = status
        r.bytesOut = bytesOut
      })
      reqEntry.endTime = endTime
      reqEntry.status = status
      reqEntry.bytesOut = bytesOut
      if (matched?.key) bumpRouteAggregates(reqEntry, matched.key)
    }
  })

  ctx.on('server/upgrade', async (req, next) => {
    const start = Date.now()
    let matched: { key: string, path: string, plugin?: string } | undefined
    try {
      for (const route of server.wsRoutes) {
        if (!route.check(req)) continue
        const interceptPath = route.config?.path || undefined
        matched = {
          key: routeKey('WS', route.path, interceptPath),
          path: stringifyPath(route.path),
          plugin: resolvePlugin(ctx, route),
        }
        break
      }
    } catch {}

    const reqEntry: ServerRequest = {
      id: ++nextRequestId,
      startTime: start,
      method: 'WS',
      path: req.path,
      status: 0,
      remote: (req as any).headers?.['x-forwarded-for']?.toString().split(',')[0]?.trim()
        || (req as any)._req?.socket?.remoteAddress
        || undefined,
      route: matched?.path,
      plugin: matched?.plugin,
    }
    pushRequest(reqEntry)

    try {
      await next()
      // If we reach here, the upgrade succeeded
      updateRequest(reqEntry.id, (r) => { r.status = 101 })
      reqEntry.status = 101

      // Hook into the WebSocket close event to finalize duration
      if (matched) {
        const matchedRef = matched
        // Wait a tick for the connection to be added to route.clients
        setImmediate(() => {
          for (const route of server.wsRoutes) {
            if (stringifyPath(route.path) !== matchedRef.path) continue
            const clients = Array.from(route.clients)
            const ws = clients[clients.length - 1]
            if (!ws) continue
            ws.once('close', () => {
              const endTime = Date.now()
              updateRequest(reqEntry.id, (r) => { r.endTime = endTime })
              reqEntry.endTime = endTime
              bumpRouteAggregates(reqEntry, matchedRef.key)
            })
            break
          }
        })
      }
    } catch (error) {
      // Upgrade failed
      const endTime = Date.now()
      updateRequest(reqEntry.id, (r) => {
        r.status = 500
        r.endTime = endTime
      })
      reqEntry.status = 500
      reqEntry.endTime = endTime
      if (matched?.key) bumpRouteAggregates(reqEntry, matched.key)
      throw error
    }
  })

  ctx.webui.addListener('server-webui.clear', () => {
    entry.mutate((d) => {
      d.requests.length = 0
      for (const key in d.routes) {
        const r = d.routes[key]
        if (r.requests === 0 && r.totalLatency === 0 && r.avgLatency === 0 && r.lastStatus === undefined) continue
        r.requests = 0
        r.totalLatency = 0
        r.avgLatency = 0
        r.lastStatus = undefined
      }
    })
  })

  // Kick off an initial network-info sync in case server.host/port became
  // available after addEntry ran.
  refreshNetwork()
}
