import { Context } from 'cordis'
import { Client } from './index.ts'
import { Dict } from 'cosmokit'

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

  export interface Init {
    entries: Dict<Entry.Data>
    serverId: string
    clientId: string
  }

  export interface Update extends Data {
    id: string
  }

  export interface Patch extends Data {
    id: string
    key?: string
  }
}

export class Entry<T = any> {
  public id = Math.random().toString(36).slice(2)
  public dispose: () => void

  constructor(public ctx: Context, public files: Entry.Files, public data?: (client: Client) => T) {
    ctx.webui.entries[this.id] = this
    ctx.webui.broadcast('entry:init', (client: Client) => ({
      serverId: ctx.webui.id,
      clientId: client.id,
      entries: {
        [this.id]: this.toJSON(client),
      },
    }))
    this.dispose = ctx.collect('entry', () => {
      delete this.ctx.webui.entries[this.id]
      ctx.webui.broadcast('entry:init', (client: Client) => ({
        serverId: ctx.webui.id,
        clientId: client.id,
        entries: {
          [this.id]: null,
        },
      }))
    })
  }

  refresh() {
    this.ctx.webui.broadcast('entry:update', (client: Client) => ({
      id: this.id,
      data: this.data?.(client),
    }))
  }

  patch(data: any, key?: string) {
    this.ctx.webui.broadcast('entry:patch', {
      id: this.id,
      data,
      key,
    })
  }

  toJSON(client: Client): Entry.Data | undefined {
    try {
      return {
        files: this.ctx.webui.resolveEntry(this.files, this.id),
        paths: this.ctx.get('loader')?.locate(),
        data: JSON.parse(JSON.stringify(this.data?.(client))),
      }
    } catch (e) {
      this.ctx.logger.error(e)
    }
  }
}
