import { SearchResult } from '@cordisjs/registry'
import BaseManager from './shared'

export * from './shared'

declare module '@cordisjs/loader' {
  interface Loader {
    market: SearchResult
  }
}

export default class BrowserManager extends BaseManager {
  async collect(forced: boolean) {
    return this.ctx.loader.market.objects
  }
}
