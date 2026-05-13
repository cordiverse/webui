import { Context, Service } from 'cordis'
import { Entry, WebUI } from '@cordisjs/plugin-webui'
import { BridgeSocket } from '../../src/bridge.ts'

export interface TestWebUIConfig {
  socket: BridgeSocket
}

export class TestWebUI extends WebUI {
  public socket: BridgeSocket

  constructor(ctx: Context, config: TestWebUIConfig) {
    super(ctx)
    this.socket = config.socket
  }

  [Service.init]() {
    this.version = '__test__'
    ;(this as any).accept(this.socket)
  }

  getEntryFiles(_entry: Entry): string[] {
    return []
  }

  resolveManifestUrl(_files: Entry.Files): string | undefined {
    return undefined
  }
}
