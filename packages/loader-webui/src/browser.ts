import { SearchResult } from './types.ts'
import { Manager } from './shared.ts'

export * from './shared.ts'

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
