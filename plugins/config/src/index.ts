import { Context } from 'cordis'
import { LocalScanner } from '@cordisjs/registry'
import { Manager } from './shared'
import { pathToFileURL } from 'url'

export * from './shared'

export default class NodeManager extends Manager {
  scanner = new LocalScanner(this.ctx.baseDir, {
    onSuccess: async (object) => {
      const { name } = object.package
      const { internal, filename } = this.ctx.loader
      if (!internal) return
      try {
        const { url } = await internal!.resolve(name, pathToFileURL(filename).href, {})
        if (internal?.loadCache.has(url)) {
          object.runtime = await this.parseExports(name)
        }
      } catch (error) {
        this.ctx.logger.warn('failed to parse %c', name)
        this.ctx.logger.debug(error)
        object.runtime = { failed: true }
      }
      this.flushPackage(name)
    },

    onFailure: (error, name) => {
      this.ctx.logger.warn('failed to resolve %c', name)
      this.ctx.logger.debug(error)
    },
  })

  constructor(ctx: Context) {
    super(ctx)
    this.packages = this.scanner.cache
  }

  async getPackages(forced: boolean) {
    await this.scanner.collect(forced)
    return this.scanner.objects
  }
}
