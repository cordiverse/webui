import { Context } from 'cordis'
import { LocalScanner } from '@cordisjs/registry'
import { Manager } from './shared'

export * from './shared'

export default class NodeManager extends Manager {
  scanner = new LocalScanner(this.ctx.baseDir, {
    onFailure: (error, name) => {
      this.ctx.logger.warn('failed to resolve %c', name)
      this.ctx.logger.debug(error)
    },
  })

  constructor(ctx: Context) {
    super(ctx)
    this.packages = this.scanner.cache
  }

  parsePackage(name: string) {
    return this.scanner.loadPackage(name)
  }

  async getPackages(forced: boolean) {
    await this.scanner.collect(forced)
    return this.scanner.objects
  }
}
