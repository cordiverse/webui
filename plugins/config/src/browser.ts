import { SearchResult } from '@cordisjs/registry'
import { Manager } from './shared'

export * from './shared'

declare module '@cordisjs/loader' {
  interface Loader {
    market: SearchResult
  }
}

export default class BrowserManager extends Manager {
  async parsePackage(name: string) {
    return this.ctx.loader.market.objects.find(object => object.package.name === name)
  }

  async getPackages(forced: boolean) {
    return this.ctx.loader.market.objects
  }
}
