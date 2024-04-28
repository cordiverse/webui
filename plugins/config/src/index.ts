import { LocalScanner } from '@cordisjs/registry'
import { Manager } from './shared'

export * from './shared'

class NodeScanner extends LocalScanner {
  constructor(private manager: NodeManager) {
    super(manager.ctx.baseDir)
  }

  async onError(error: any, name: string) {
    this.manager.ctx.logger.warn('failed to resolve %c', name)
    this.manager.ctx.logger.warn(error)
  }

  async parsePackage(name: string) {
    const result = await super.parsePackage(name)
    try {
      // require.resolve(name) may be different from require.resolve(path)
      // because tsconfig-paths may resolve the path differently
      const entry = require.resolve(name)
      if (require.cache[entry]) {
        this.manager.cache[name] = await this.manager.parseExports(name)
      }
    } catch (error) {
      this.onError(error, name)
    }
    return result
  }
}

export default class NodeManager extends Manager {
  scanner = new NodeScanner(this)

  async collect(forced: boolean) {
    await this.scanner.collect(forced)
    return this.scanner.objects
  }
}
