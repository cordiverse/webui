import { Context } from 'cordis'
import { Client } from './index.ts'

export namespace Entry {
  export interface Files {
    base?: string
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
    this.ctx.webui.broadcast('entry:refresh', (client: Client) => ({
      id: this.id,
      data: this.data?.(),
    }))
  }

  patch(data: any, key?: string) {
    this.ctx.webui.broadcast('entry:patch', {
      id: this.id,
      data,
      key,
    })
  }

  toJSON(): Entry.Data | undefined {
    try {
      return {
        files: this.ctx.webui.resolveEntry(this.files, this.id),
        paths: this.ctx.get('loader')?.locate(),
        data: JSON.parse(JSON.stringify(this.data?.())),
      }
    } catch (e) {
      this.ctx.logger.error(e)
    }
  }
}
