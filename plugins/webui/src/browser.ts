import { Schema } from 'cordis'
import { makeArray } from 'cosmokit'
import { Entry, Events, WebUI } from './shared/index.ts'
import {} from '@cordisjs/loader'

export * from './shared/index.ts'

class BrowserWebUI extends WebUI {
  start() {
    this.accept(this.ctx.loader[Symbol.for('cordis.webui.socket')])
  }

  addListener<K extends keyof Events>(event: K, callback: Events[K]): void {
    // TODO
  }

  resolveEntry(files: Entry.Files) {
    if (typeof files === 'string' || Array.isArray(files)) return makeArray(files)
    return makeArray(files.prod)
  }
}

namespace BrowserWebUI {
  export interface Config {}

  export const Config: Schema<Config> = Schema.object({})
}

export default BrowserWebUI
