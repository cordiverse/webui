// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Context, Service } from 'cordis'
import LoggerConsole from '@cordisjs/plugin-logger-console'
import { Entry } from '@cordisjs/plugin-webui'
import { OnlineWebUI } from '../client/online-webui.ts'
import { createSocketBridge, SocketBridge } from '@cordisjs/plugin-webui'

/**
 * Test subclass that skips the loader-socket plumbing and takes the socket
 * directly via config — real OnlineWebUI reads the socket off `ctx.loader`,
 * which would require a full loader bootstrap.
 */
class TestOnlineWebUI extends OnlineWebUI {
  public _testSocket: SocketBridge['server']
  constructor(ctx: Context, opts: { socket: SocketBridge['server'] }) {
    super(ctx)
    this._testSocket = opts.socket
    this.version = 'test'
  }
  override[Service.init]() {
    (this as any).accept(this._testSocket)
  }
}

describe('OnlineWebUI', () => {
  let ctx: Context
  let bridge: SocketBridge

  beforeEach(async () => {
    ctx = new Context()
    bridge = createSocketBridge()
    await ctx.plugin(LoggerConsole, { console: { enabled: false } })
    await ctx.plugin(TestOnlineWebUI, { socket: bridge.server })
  })

  afterEach(() => {
    if (bridge) {
      bridge.client.close()
      bridge.server.close()
    }
  })

  describe('getEntryFiles', () => {
    it('returns an empty list when the entry has no manifest', () => {
      const entry = {} as Entry
      expect(ctx.webui.getEntryFiles(entry)).toEqual([])
    })

    it('rewrites entry chunks to URLs relative to manifest.url', () => {
      const entry = {
        manifest: {
          path: '',
          url: 'http://host/-/modules/my-pkg/dist/manifest.json',
          chunks: {
            'index.ts': { file: 'index-abc.js', isEntry: true },
            'side.ts': { file: 'side-def.js' },
            'style.css': { file: 'style-xyz.css' },
          },
        },
      } as unknown as Entry
      const files = ctx.webui.getEntryFiles(entry)
      expect(files).toContain('http://host/-/modules/my-pkg/dist/index-abc.js')
      expect(files).not.toContain('http://host/-/modules/my-pkg/dist/side-def.js')
      expect(files).toContain('http://host/-/modules/my-pkg/dist/style-xyz.css')
    })
  })

  describe('resolveManifestUrl', () => {
    it('returns undefined when no manifest path is given', () => {
      const url = ctx.webui.resolveManifestUrl({
        baseUrl: 'http://localhost/foo',
      } as Entry.Files)
      expect(url).toBeUndefined()
    })

    it('returns an absolute URL by resolving against baseUrl', () => {
      const url = ctx.webui.resolveManifestUrl({
        baseUrl: 'http://localhost/-/modules/my-pkg/dist/index.js',
        manifest: './manifest.json',
      } as Entry.Files)
      expect(url).toBe('http://localhost/-/modules/my-pkg/dist/manifest.json')
    })
  })
})
