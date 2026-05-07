import { Context } from 'cordis'
import type * as vite from 'vite'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { DeltaState, observe } from '@cordisjs/muon'
import { EntryData } from '../../shared'

export namespace Entry {
  export interface Files {
    path?: string
    base: string
    dev?: string
    prod: string
  }

  export interface Manifest {
    url: string
    path: string
    chunks: vite.Manifest
  }
}

export class Entry<T extends object = any> {
  public id = Math.random().toString(36).slice(2)
  public manifest?: Entry.Manifest
  public dispose: () => void
  public state = new DeltaState()

  private _initialized = false
  private _disposed = false
  private _loadTask?: Promise<void>
  private _dirty = false

  constructor(public ctx: Context, public files: Entry.Files, public data: T) {
    this.initialize()
    this.dispose = ctx.effect(() => () => {
      this._disposed = true
      if (!this._initialized) return
      delete this.ctx.webui.entries[this.id]
      ctx.webui.broadcast('entry:init', {
        version: ctx.webui.version,
        entries: {
          [this.id]: null,
        },
      })
    }, 'ctx.webui.addEntry()')
  }

  private async initialize() {
    const url = this.ctx.webui.resolveManifestUrl(this.files)
    if (url) {
      this.manifest = { url, path: '', chunks: {} }
      try {
        await Promise.all([this._loadManifest(), this._resolvePath()])
      } catch (e) {
        this.ctx.logger.error(e)
        return
      }
    }
    if (this._disposed) return
    this.ctx.webui.entries[this.id] = this
    this._initialized = true
    this._broadcast()
  }

  async refreshManifest() {
    try {
      await this._loadManifest()
    } catch (e) {
      this.ctx.logger.error(e)
      return
    }
    if (this._disposed) return
    this._broadcast()
  }

  private _broadcast() {
    this.ctx.webui.broadcast('entry:init', {
      version: this.ctx.webui.version,
      entries: {
        [this.id]: this.toJSON()!,
      },
    })
  }

  private _loadManifest(): Promise<void> {
    if (this._loadTask) {
      this._dirty = true
      return this._loadTask
    }
    this._loadTask = (async () => {
      try {
        do {
          this._dirty = false
          const content = await readFile(fileURLToPath(this.manifest!.url), 'utf-8')
          if (this._disposed) return
          this.manifest!.chunks = JSON.parse(content)
        } while (this._dirty)
      } finally {
        this._loadTask = undefined
      }
    })()
    return this._loadTask
  }

  private async _resolvePath() {
    if (this.files.path) {
      this.manifest!.path = this.files.path
      return
    }
    const baseDir = dirname(fileURLToPath(this.files.base))
    const prodDir = dirname(fileURLToPath(new URL(this.files.prod, this.files.base)))
    let dir = baseDir
    while (true) {
      try {
        const content = await readFile(resolve(dir, 'package.json'), 'utf-8')
        const pkg = JSON.parse(content)
        if (pkg.name) {
          const tail = relative(dir, prodDir).split(/[\\/]/).join('/')
          this.manifest!.path = tail ? `${pkg.name}/${tail}` : pkg.name
          return
        }
      } catch {}
      const parent = dirname(dir)
      if (parent === dir) {
        throw new Error(`cannot resolve path from ${this.files.base}`)
      }
      dir = parent
    }
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
