import { SearchResult } from '@cordisjs/registry'
import { Manager } from './shared'

export * from './shared'

declare module '@cordisjs/loader' {
  interface Loader {
    market: SearchResult
  }
}

export default class BrowserManager extends Manager {
  async getPackages(forced: boolean) {
    return this.ctx.loader.market.objects
  }
}
