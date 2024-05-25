import { Context } from 'cordis'
import { Client } from './index.ts'

export namespace Entry {
  export type Files = string | string[] | EntryOptions

  export interface EntryOptions {
    dev: string
    prod: string | string[]
  }

  export interface Data {
    files: string[]
    paths?: string[]
    data?: any
  }
}

export class Entry<T = any> {
  public id = Math.random().toString(36).slice(2)
  public dispose: () => void

  constructor(public ctx: Context, public files: Entry.Files, public data?: () => T) {
    ctx.webui.entries[this.id] = this
    ctx.webui.broadcast('entry:init', {
      [this.id]: this,
    })
    this.dispose = ctx.collect('entry', () => {
      delete this.ctx.webui.entries[this.id]
      ctx.webui.broadcast('entry:init', {
        [this.id]: null,
      })
    })
  }

  refresh() {
    this.ctx.webui.broadcast('entry:refresh', async (client: Client) => ({
      id: this.id,
      data: await this.data!(),
    }))
  }

  patch(data: any, key?: string) {
    this.ctx.webui.broadcast('entry:patch', {
      id: this.id,
      data,
      key,
    })
  }

  toJSON(): Entry.Data {
    return {
      files: this.ctx.webui.resolveEntry(this.files, this.id),
      paths: this.ctx.get('loader')?.locate(),
      data: this.data?.(),
    }
  }
}
