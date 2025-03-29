import { z, Service } from 'cordis'
import { Entry, Events, WebUI } from './shared/index.ts'
import {} from 'cordis/loader'

export * from './shared/index.ts'

class BrowserWebUI extends WebUI {
  [Service.init]() {
    this.accept(this.ctx.loader[Symbol.for('cordis.webui.socket')])
  }

  addListener<K extends keyof Events>(event: K, callback: Events[K]): void {
    // TODO
  }

  getEntryFiles(entry: Entry) {
    return Object.values(entry.getManifest())
      // TODO filter entry files
      .map((chunk) => new URL(chunk.file, entry.files.base).href)
  }
}

namespace BrowserWebUI {
  export interface Config {}

  export const Config: z<Config> = z.object({})
}

export default BrowserWebUI
