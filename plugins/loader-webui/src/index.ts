import { Context } from 'cordis'
import { LocalScanner } from '@cordisjs/registry'
import { fileURLToPath } from 'node:url'
import { Manager } from './shared'
import type { ResolveResult } from '@cordisjs/plugin-loader'

export * from './shared'

export default class NodeManager extends Manager {
  scanner = new LocalScanner(fileURLToPath(this.ctx.baseUrl!), {
    onSuccess: async (object) => {
      const { name } = object.package
      const { internal } = this.ctx.loader
      if (!internal) return
      try {
        const baseUrl = this.ctx.baseUrl!
        let resolved: ResolveResult
        switch (internal.version) {
          case 'v1': resolved = await internal.resolve(name, baseUrl, {}); break
          case 'v2': resolved = internal.resolveSync(baseUrl, { specifier: name, attributes: {} }); break
        }
        if (internal.loadCache.has(resolved.url)) {
          object.runtime = await this.parseExports(name)
        }
      } catch (error) {
        this.ctx.logger.warn('failed to parse %c', name)
        this.ctx.logger.debug(error)
        object.runtime = null
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

  async getPackages() {
    return this.scanner.collect()
  }

  async getDependencies() {
    return this.scanner.scan()
  }
}
