import { Context, Service } from 'cordis'
import Console, { Client } from './index.ts'

export namespace DataService {
  export interface Options {
    immediate?: boolean
    authority?: number
  }
}

export abstract class DataService<T = never> extends Service {
  static inject = ['webui']

  public async get(forced?: boolean, client?: Client): Promise<T> {
    return null as T
  }

  constructor(protected ctx: Context, protected key: keyof Console.Services, public options: DataService.Options = {}) {
    super(ctx, `webui:${key}`, options.immediate)
  }

  start() {
    this.refresh()
  }

  async refresh(forced = true) {
    this.ctx.get('webui')?.broadcast('data', async (client: Client) => ({
      key: this.key,
      value: await this.get(forced, client),
    }), this.options)
  }

  patch(value: T) {
    this.ctx.get('webui')?.broadcast('patch', {
      key: this.key,
      value,
    }, this.options)
  }
}
