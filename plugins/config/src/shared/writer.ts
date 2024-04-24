import { DataService } from '@cordisjs/webui'
import { Context, Logger } from 'cordis'
import { Entry, Loader } from '@cordisjs/loader'

declare module '@cordisjs/webui' {
  interface Events {
    'manager/app-reload'(config: any): void
    'manager/teleport'(source: string, key: string, target: string, index: number): void
    'manager/reload'(id: string, config: any): void
    'manager/unload'(id: string, config: any): void
    'manager/add'(options: any, parent: string, index?: number): string
    'manager/remove'(id: string): void
    'manager/meta'(ident: string, config: any): void
  }
}

const logger = new Logger('loader')

export class ConfigWriter extends DataService<Entry.Options[]> {
  protected loader: Loader

  constructor(ctx: Context) {
    super(ctx, 'config', { authority: 4 })
    this.loader = ctx.loader

    for (const key of ['teleport', 'reload', 'unload', 'remove', 'meta', 'add'] as const) {
      ctx.console.addListener(`manager/${key}`, async (...args: any[]) => {
        try {
          await this[key].apply(this, args)
        } catch (error) {
          logger.error(error)
          throw new Error('failed')
        }
      }, { authority: 4 })
    }

    ctx.on('config', () => this.refresh())
  }

  async get() {
    return this.loader.config
  }

  async meta(ident: string, config: any) {
    // const [parent, key] = this.resolveConfig(ident)
    // const target = parent[key]
    // for (const key of Object.keys(config)) {
    //   delete target[key]
    //   if (config[key] === null) {
    //     delete config[key]
    //   }
    // }
    // insertKey(target, config, Object.keys(target))
    // await this.loader.writeConfig(true)
  }

  async reload(id: string, config: any) {
    const entry = this.loader.entries[id]
    if (!entry) throw new Error('entry not found')
    entry.options.config = config
    delete entry.options.disabled
    entry.resume()
  }

  async unload(id: string, config: any) {
    const entry = this.loader.entries[id]
    if (!entry) throw new Error('entry not found')
    entry.options.config = config
    entry.options.disabled = true
    entry.resume()
  }

  async add(options: Omit<Entry.Options, 'id'>, parent: string, index?: number) {
    return this.loader.add(options, parent, index)
  }

  async remove(id: string) {
    this.loader.remove(id)
  }

  async teleport(source: string, key: string, target: string, index: number) {
    // const parentS = this.resolveFork(source)
    // const parentT = this.resolveFork(target)

    // // teleport fork
    // const fork = parentS?.[Loader.kRecord]?.[key]
    // if (fork && parentS !== parentT) {
    //   delete parentS[Loader.kRecord][key]
    //   parentT[Loader.kRecord][key] = fork
    //   remove(parentS.disposables, fork.dispose)
    //   parentT.disposables.push(fork.dispose)
    //   fork.parent = parentT.ctx
    //   Object.setPrototypeOf(fork.ctx, parentT.ctx)
    //   fork.ctx.emit('internal/fork', fork)
    //   if (fork.runtime.using.some(name => parentS[name] !== parentT[name])) {
    //     fork.restart()
    //   }
    // }

    // // teleport config
    // const temp = dropKey(parentS.config, key)
    // const rest = Object.keys(parentT.config).slice(index)
    // insertKey(parentT.config, temp, rest)
    // await this.loader.writeConfig()
  }
}
