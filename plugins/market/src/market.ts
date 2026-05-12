import { Context, Inject, Service } from 'cordis'
import { Dict, Time } from 'cosmokit'
import type {} from '@cordisjs/plugin-http'
import type {} from '@cordisjs/plugin-webui'
import type { SearchObject, SearchResult } from './types.ts'
import z from 'schemastery'

declare module 'cordis' {
  interface Context {
    market: Market
  }
}

export interface MarketData {
  endpoint: string
  data: Dict<SearchObject>
  total: number
  time: string
  loading: boolean
  error?: string
}

class Market extends Service {
  static name = 'market'

  public data: Dict<SearchObject> = {}
  public total = 0
  public time = ''
  public error?: string
  public loading = false

  private _lastRefresh = 0
  private _listeners = new Set<() => void>()

  constructor(public ctx: Context, public config: Market.Config) {
    super(ctx, 'market')
  }

  async [Service.init]() {
    await this.refresh().catch((error) => {
      this.ctx.logger.warn(error)
    })
  }

  snapshot(): MarketData {
    return {
      endpoint: this.config.endpoint,
      data: this.data,
      total: this.total,
      time: this.time,
      loading: this.loading,
      error: this.error,
    }
  }

  async refresh(force = false) {
    if (this.loading) return
    if (!force && Date.now() - this._lastRefresh < this.config.ttl) return

    this.loading = true
    this.error = undefined
    this.emit()

    try {
      const result = await this.ctx.http.get<SearchResult>(this.config.endpoint, {
        timeout: this.config.timeout,
      })
      this.data = Object.fromEntries(result.objects.map(obj => [obj.package.name, obj]))
      this.total = result.total
      this.time = result.time
      this._lastRefresh = Date.now()
    } catch (e: any) {
      this.error = String(e?.message ?? e)
      this.ctx.logger.warn('failed to fetch market: %s', this.error)
    } finally {
      this.loading = false
      this.emit()
    }
  }

  subscribe(fn: () => void) {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  }

  private emit() {
    for (const fn of this._listeners) fn()
  }
}

namespace Market {
  export interface Config {
    endpoint: string
    timeout: number
    ttl: number
  }

  export const Config: z<Config> = z.object({
    endpoint: z.string().role('link').default('https://registry.cordis.io/index.json')
      .description('搜索服务地址。应当返回一个符合 SearchResult 结构的 JSON。'),
    timeout: z.number().role('time').default(Time.second * 30)
      .description('请求超时时间。'),
    ttl: z.number().role('time').default(Time.hour * 12)
      .description('市场缓存的有效期；过期后客户端连接会触发自动刷新。'),
  })
}

export { Market }
export default Market
