import { Service } from 'cordis'
import { Entry, Events, WebUI } from './base/index.ts'
import {} from '@cordisjs/plugin-loader'
import z from 'schemastery'

export * from './base/index.ts'

class BrowserWebUI extends WebUI {
  [Service.init]() {
    this.accept(this.ctx.loader[Symbol.for('cordis.webui.socket')])
  }

  addListener<K extends keyof Events>(event: K, callback: Events[K]): void {
    // TODO
  }

  getEntryFiles(entry: Entry) {
    // TODO
    return []
  }

  resolveManifestUrl(files: Entry.Files): string | undefined {
    // TODO
    return undefined
  }
}

namespace BrowserWebUI {
  export interface Config {}

  export const Config: z<Config> = z.object({})
}

export default BrowserWebUI
