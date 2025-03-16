import { Context } from 'cordis'
import { Client } from './index.ts'
import { Dict } from 'cosmokit'
import type { Manifest } from 'vite'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

export namespace Entry {
  export interface Files {
    path?: string
    base: string
    dev?: string
    prod: string
  }

  export interface Data {
    files: string[]
    entryId?: string
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

  private _disposed = false
  private _manifest: Manifest | undefined

  constructor(public ctx: Context, public files: Entry.Files, public data?: (client: Client) => T) {
    ctx.webui.entries[this.id] = this
    ctx.webui.broadcast('entry:init', (client: Client) => ({
      serverId: ctx.webui.id,
      clientId: client.id,
      entries: {
        [this.id]: this.toJSON(client),
      },
    }))
    this.dispose = ctx.effect(() => () => {
      this._disposed = true
      delete this.ctx.webui.entries[this.id]
      ctx.webui.broadcast('entry:init', (client: Client) => ({
        serverId: ctx.webui.id,
        clientId: client.id,
        entries: {
          [this.id]: null,
        },
      }))
    }, 'ctx.webui.addEntry()')
  }

  getManifest() {
    if (this._manifest) return this._manifest
    const prodBase = fileURLToPath(new URL(this.files.prod, this.files.base))
    const manifest: Manifest = JSON.parse(readFileSync(prodBase, 'utf-8'))
    return this._manifest = manifest
  }

  refresh() {
    if (this._disposed) return
    this.ctx.webui.broadcast('entry:update', (client: Client) => ({
      id: this.id,
      data: this.data?.(client),
    }))
  }

  patch(data: any, key?: string) {
    if (this._disposed) return
    this.ctx.webui.broadcast('entry:patch', {
      id: this.id,
      data,
      key,
    })
  }

  toJSON(client: Client): Entry.Data | undefined {
    try {
      return {
        files: this.ctx.webui.getEntryFiles(this),
        entryId: this.ctx.get('loader')?.locate(),
        data: JSON.parse(JSON.stringify(this.data?.(client))),
      }
    } catch (e) {
      this.ctx.logger.error(e)
    }
  }
}
