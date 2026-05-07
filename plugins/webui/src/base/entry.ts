import { Context } from 'cordis'
import type { Manifest } from 'vite'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { DeltaState, observe } from '@cordisjs/muon'
import { EntryData } from '../../shared'

export namespace Entry {
  export interface Files {
    path?: string
    base: string
    dev?: string
    prod: string
  }
}

export class Entry<T extends object = any> {
  public id = Math.random().toString(36).slice(2)
  public manifestUrl?: string
  public dispose: () => void
  public state = new DeltaState()

  private _initialized = false
  private _disposed = false
  private _version = 0
  private _manifest: Manifest | undefined

  constructor(public ctx: Context, public files: Entry.Files, public data: T) {
    this.manifestUrl = ctx.webui.resolveManifestUrl(files)
    this.refresh()
    this.dispose = ctx.effect(() => () => {
      this._disposed = true
      if (!this._initialized) return
      delete this.ctx.webui.entries[this.id]
      ctx.webui.broadcast('entry:init', {
        serverId: ctx.webui.id,
        entries: {
          [this.id]: null,
        },
      })
    }, 'ctx.webui.addEntry()')
  }

  getManifest(): Manifest | undefined {
    return this._manifest
  }

  async refresh() {
    const version = ++this._version
    if (this.manifestUrl) {
      try {
        const content = await readFile(fileURLToPath(this.manifestUrl), 'utf-8')
        if (this._disposed) return
        if (version !== this._version) return
        this._manifest = JSON.parse(content) as Manifest
      } catch (e) {
        this.ctx.logger.error(e)
        return
      }
    }
    if (!this._initialized) {
      this.ctx.webui.entries[this.id] = this
      this._initialized = true
    }
    this.ctx.webui.broadcast('entry:init', {
      serverId: this.ctx.webui.id,
      entries: {
        [this.id]: this.toJSON()!,
      },
    })
  }

  mutate(fn: (data: T) => void): void {
    if (this._disposed) return
    if (!this.data) return
    const mutation = observe(this.data, fn)
    if (!mutation) return
    const delta = this.state.dump(mutation)
    if (!this._initialized) return
    this.ctx.webui.broadcast('entry:delta', { id: this.id, ...delta })
  }

  toJSON(): EntryData | undefined {
    try {
      return {
        files: this.ctx.webui.getEntryFiles(this),
        entryId: this.ctx.get('loader')?.locate(),
        data: this.data,
        cursor: this.state.snapshot(),
      }
    } catch (e) {
      this.ctx.logger.error(e)
    }
  }
}
