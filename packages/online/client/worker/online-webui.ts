/**
 * Browser-side WebUI subclass.
 *
 * Two responsibilities beyond the base `WebUI`:
 *
 * - `getEntryFiles(entry)` returns the chunk URL list for an entry. We compute
 *   it as `new URL(chunk.file, manifest.url).href` so the scheme is whatever
 *   `manifest.url` is: in dev the manifest fetches via `/@fs/<abs>/dist/...`,
 *   in prod via `/-/modules/<name>/dist/...` (SW-routed). `manifest.path` is
 *   therefore unused — we set `files.modulePath = ''` on every entry so the
 *   base `Entry._resolvePath` skips the fs walk that would otherwise throw
 *   on non-`file:` baseUrls.
 *
 * - The in-process WebSocket bridge is passed via plugin config — one root
 *   ctx and one bridge per page, no schemastery validation needed.
 */

import { Context, Service } from 'cordis'
import { Entry, WebSocket, WebUI } from '@cordisjs/plugin-webui'

export interface OnlineWebUIConfig {
  socket: WebSocket
}

export class OnlineWebUI extends WebUI {
  static name = 'webui'

  constructor(ctx: Context, public config: OnlineWebUIConfig) {
    super(ctx)
  }

  ;[Service.init]() {
    this.accept(this.config.socket)
  }

  override addEntry<T extends object = never>(files: Entry.Files, data?: T) {
    return super.addEntry({ modulePath: '', ...files }, data)
  }

  getEntryFiles(entry: Entry): string[] {
    if (!entry.manifest) return []
    const base = entry.manifest.url
    return Object.values(entry.manifest.chunks)
      .filter((chunk) => chunk.isEntry || !chunk.file.endsWith('.js'))
      .map((chunk) => new URL(chunk.file, base).href)
  }

  resolveManifestUrl(files: Entry.Files): string | undefined {
    if (!files.manifest) return undefined
    return new URL(files.manifest, files.baseUrl).href
  }
}

export default OnlineWebUI
