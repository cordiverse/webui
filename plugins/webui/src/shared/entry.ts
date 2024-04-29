import { Context } from 'cordis'
import { Client } from './index.ts'

export namespace Entry {
  export type Files = string | string[] | EntryOptions

  export interface EntryOptions {
    dev: string
    prod: string | string[]
  }
}

export class Entry<T = any> {
  public id = Math.random().toString(36).slice(2)
  public dispose: () => void

  constructor(public ctx: Context, public files: Entry.Files, public data?: (client: Client) => T) {
    ctx.webui.entries[this.id] = this
    ctx.webui.refresh('entry')
    this.dispose = ctx.collect('entry', () => {
      delete this.ctx.webui.entries[this.id]
      ctx.webui.refresh('entry')
    })
  }

  refresh() {
    this.ctx.webui.broadcast('entry:data', async (client: Client) => ({
      id: this.id,
      data: await this.data!(client),
    }))
  }

  patch(data: any, key?: string) {
    this.ctx.webui.broadcast('entry:patch', {
      id: this.id,
      data,
      key,
    })
  }
}
