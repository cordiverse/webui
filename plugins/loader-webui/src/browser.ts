import { SearchResult } from '@cordisjs/registry'
import { Manager } from './shared'

export * from './shared'

declare module '@cordisjs/plugin-loader' {
  interface Loader {
    market: SearchResult
  }
}

export default class BrowserManager extends Manager {
  async getPackages() {
    return this.ctx.loader.market.objects
  }

  async getDependencies() {
    // TODO simulate dependencies
    return []
  }
}
