import { Context } from 'cordis'
import type * as vite from 'vite'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { DeltaState, observe } from '@cordisjs/muon'
import { EntryData } from '../../shared'

export namespace Entry {
  export interface Files {
    /**
     * Path under which the entry's chunks are served (URL segment after
     * `/-/v1/modules/`). Auto-derived from the package name + relative
     * location of the prod manifest if omitted.
     */
    modulePath?: string
    /** Base URL for resolving relative `source`/`manifest` URLs. Conventionally `import.meta.url`. */
    baseUrl: string
    /** Dev-mode entry source URL (a `.ts` file), relative to `baseUrl`. */
    source?: string
    /** Prod-mode `manifest.json` URL, relative to `baseUrl`. */
    manifest: string
    /**
     * Client-side route patterns this entry registers (e.g. `/plugins/:id*`).
     * The server uses these to decide the SPA fallback's status code: paths
     * that don't match any registered pattern get HTTP 404 (the html shell is
     * still served, so the client can render its own 404 view). The client
     * uses them too: while modules are still importing, a path covered by
     * any entry's `routes` shows a loading view instead of 404.
     */
    routes?: string[]
  }

  export interface Manifest {
    url: string
    path: string
    chunks: vite.Manifest
  }
}

export function extractMethods(data: any): string[] {
  if (!data || typeof data !== 'object') return []
  return Object.keys(data).filter(k => typeof data[k] === 'function')
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
    if (this.files.modulePath) {
      this.manifest!.path = this.files.modulePath
      return
    }
    const baseDir = dirname(fileURLToPath(this.files.baseUrl))
    const prodDir = dirname(fileURLToPath(new URL(this.files.manifest, this.files.baseUrl)))
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
        throw new Error(`cannot resolve path from ${this.files.baseUrl}`)
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
        methods: extractMethods(this.data),
      }
    } catch (e) {
      this.ctx.logger.error(e)
    }
  }
}
