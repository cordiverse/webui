import { Context, Schema } from 'cordis'
import { Dict, makeArray, noop, Time } from 'cosmokit'
import { WebSocketLayer } from '@cordisjs/plugin-server'
import { FileSystemServeOptions, ViteDevServer } from 'vite'
import { extname, resolve } from 'node:path'
import { createReadStream, existsSync, Stats } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parse } from 'es-module-lexer'
import { Entry, Events, WebUI } from './shared'
import open from 'open'

declare module 'cordis' {
  interface EnvData {
    clientCount?: number
  }
}

export * from './shared'

function escapeHTML(source: string, inline = false) {
  const result = (source ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return inline
    ? result.replace(/"/g, '&quot;')
    : result
}

export interface ClientConfig {
  devMode: boolean
  uiPath: string
  endpoint: string
  static?: boolean
  heartbeat?: HeartbeatConfig
  proxyBase?: string
}

interface HeartbeatConfig {
  interval?: number
  timeout?: number
}

class NodeWebUI extends WebUI<NodeWebUI.Config> {
  static inject = {
    required: ['server'],
    optional: ['webui'], // FIXME
  }

  public vite!: ViteDevServer
  public root: string
  public layer: WebSocketLayer

  constructor(public ctx: Context, config: NodeWebUI.Config) {
    super(ctx, config)

    this.layer = ctx.server.ws(config.apiPath, (socket, request) => {
      this.accept(socket, request)
    })

    ctx.on('webui/connection', () => {
      const loader = ctx.get('loader')
      if (!loader) return
      loader.envData.clientCount = this.layer.clients.size
    })

    this.root = fileURLToPath(config.devMode
      ? new URL('./app', import.meta.resolve('@cordisjs/client/package.json'))
      : new URL('../dist', import.meta.url))
  }

  createGlobal() {
    const global = {} as ClientConfig
    const { devMode, uiPath, apiPath, selfUrl, heartbeat } = this.config
    global.devMode = devMode
    global.uiPath = uiPath
    global.heartbeat = heartbeat
    global.endpoint = selfUrl + apiPath
    const proxy = this.ctx.get('server.proxy')
    if (proxy) global.proxyBase = proxy.config.path + '/'
    return global
  }

  async start() {
    if (this.config.devMode) await this.createVite()
    this.serveAssets()

    this.ctx.on('server/ready', () => {
      const target = this.ctx.server.selfUrl + this.config.uiPath
      if (this.config.open && !this.ctx.get('loader')?.envData.clientCount && !process.env.CORDIS_AGENT) {
        open(target)
      }
      this.ctx.logger.info('webui is available at %c', target)
    })
  }

  addListener<K extends keyof Events>(event: K, callback: Events[K]) {
    this.ctx.server.post(`${this.config.apiPath}/${event}`, async (koa) => {
      const { body, headers } = koa.request
      try {
        koa.body = JSON.stringify(await (callback as any).call(headers, body) ?? {})
        koa.type = 'application/json'
        koa.status = 200
      } catch (error) {
        this.ctx.logger.warn(error)
        koa.status = 500
      }
    })
  }

  private getPaths(files: Entry.Files) {
    if (this.config.devMode && files.dev) {
      const filename = fileURLToPath(new URL(files.dev, files.base))
      if (existsSync(filename)) return [filename]
    }
    return makeArray(files.prod).map(url => fileURLToPath(new URL(url, files.base)))
  }

  resolveEntry(files: Entry.Files, key: string) {
    return this.getPaths(files).map((path, index) => {
      if (this.config.devMode) {
        return `/vite/@fs/${path}`
      } else {
        return `${this.config.uiPath}/@vendor/${key}/${index}${extname(path)}`
      }
    })
  }

  private serveAssets() {
    const { uiPath } = this.config

    this.ctx.server.get(uiPath + '(.*)', async (ctx, next) => {
      await next()
      if (ctx.body || ctx.response.body) return

      // add trailing slash and redirect
      if (ctx.path === uiPath && !uiPath.endsWith('/')) {
        return ctx.redirect(ctx.path + '/')
      }

      const name = ctx.path.slice(uiPath.length).replace(/^\/+/, '')
      const sendFile = (filename: string) => {
        ctx.type = extname(filename)
        return ctx.body = createReadStream(filename)
      }

      if (name.startsWith('@vendor/')) {
        const [key, value] = name.slice(8).split('/')
        if (!this.entries[key]) return ctx.status = 404
        const paths = this.getPaths(this.entries[key].files)
        const type = extname(value)
        const index = value.slice(0, -type.length)
        if (!paths[index]) return ctx.status = 404
        const filename = paths[index]
        ctx.type = type
        if (this.config.devMode || ctx.type !== 'application/javascript') {
          return sendFile(filename)
        }

        // we only transform js imports in production mode
        const source = await readFile(filename, 'utf8')
        return ctx.body = await this.transformImport(source)
      }

      const filename = resolve(this.root, name)
      if (!filename.startsWith(this.root) && !filename.includes('node_modules')) {
        return ctx.status = 403
      }

      const stats = await stat(filename).catch<Stats>(noop)
      if (stats?.isFile()) return sendFile(filename)
      const template = await readFile(resolve(this.root, 'index.html'), 'utf8')
      ctx.type = 'html'
      ctx.body = await this.transformHtml(template)
    })
  }

  private resolveImport(name?: string) {
    if (!name) {
      this.ctx.logger.warn('cannot transform dynamic import names')
      return name
    }
    return ({
      'vue': this.config.uiPath + '/vue.js',
      'vue-router': this.config.uiPath + '/vue-router.js',
      '@vueuse/core': this.config.uiPath + '/vueuse.js',
      '@cordisjs/client': this.config.uiPath + '/client.js',
    })[name] ?? name
  }

  private async transformImport(source: string) {
    let output = '', lastIndex = 0
    const [imports] = parse(source)
    for (const { s, e, n } of imports) {
      output += source.slice(lastIndex, s) + this.resolveImport(n)
      lastIndex = e
    }
    return output + source.slice(lastIndex)
  }

  private async transformHtml(template: string) {
    const { uiPath, head = [] } = this.config
    if (this.vite) {
      template = await this.vite.transformIndexHtml(uiPath, template)
    } else {
      template = template.replace(/(href|src)="(?=\/)/g, (_, $1) => `${$1}="${uiPath}`)
    }
    let headInjection = `<script>CLIENT_CONFIG = ${JSON.stringify(this.createGlobal())}</script>`
    for (const { tag, attrs = {}, content } of head) {
      const attrString = Object.entries(attrs).map(([key, value]) => ` ${key}="${escapeHTML(value ?? '', true)}"`).join('')
      headInjection += `<${tag}${attrString}>${content ?? ''}</${tag}>`
    }
    return template.replace('<title>', headInjection + '<title>')
  }

  private async createVite() {
    const { cacheDir, dev } = this.config
    const { createServer } = await import('@cordisjs/client/lib')

    this.vite = await createServer(this.ctx.baseDir, {
      cacheDir: cacheDir && resolve(this.ctx.baseDir, cacheDir),
      server: {
        fs: dev?.fs,
      },
      plugins: [{
        name: 'cordis-hmr',
        transform: (code, id, options) => {
          for (const [key, { files }] of Object.entries(this.entries)) {
            const index = this.getPaths(files).indexOf(id)
            if (index < 0) continue
            code += [
              'if (import.meta.hot) {',
              '  import.meta.hot.accept(async (module) => {',
              '    const { root } = await import("@cordisjs/client");',
              `    const fork = root.$loader.entries["${key}"]?.forks[${index}];`,
              '    return fork?.update(module, true);',
              '  });',
              '}',
            ].join('\n') + '\n'
            return { code }
          }
        },
      }],
    })

    this.ctx.server.all('/vite(.*)', (ctx) => new Promise((resolve) => {
      this.vite.middlewares(ctx.req, ctx.res, resolve)
    }))

    this.ctx.on('dispose', () => this.vite.close())
  }

  stop() {
    this.layer.close()
  }
}

namespace NodeWebUI {
  export interface Dev {
    fs: FileSystemServeOptions
  }

  export const Dev: Schema<Dev> = Schema.object({
    fs: Schema.object({
      strict: Schema.boolean().default(true),
      // FIXME fix typings
      allow: Schema.array(String).default(null as any),
      deny: Schema.array(String).default(null as any),
    }).hidden(),
  })

  export interface Head {
    tag: string
    attrs?: Dict<string>
    content?: string
  }

  export const Head: Schema<Head> = Schema.intersect([
    Schema.object({
      tag: Schema.union([
        'title',
        'link',
        'meta',
        'script',
        'style',
        Schema.string(),
      ]).required(),
    }),
    Schema.union([
      Schema.object({
        tag: Schema.const('title').required(),
        content: Schema.string().role('textarea'),
      }),
      Schema.object({
        tag: Schema.const('link').required(),
        attrs: Schema.dict(Schema.string()).role('table'),
      }),
      Schema.object({
        tag: Schema.const('meta').required(),
        attrs: Schema.dict(Schema.string()).role('table'),
      }),
      Schema.object({
        tag: Schema.const('script').required(),
        attrs: Schema.dict(Schema.string()).role('table'),
        content: Schema.string().role('textarea'),
      }),
      Schema.object({
        tag: Schema.const('style').required(),
        attrs: Schema.dict(Schema.string()).role('table'),
        content: Schema.string().role('textarea'),
      }),
      Schema.object({
        tag: Schema.string().required(),
        attrs: Schema.dict(Schema.string()).role('table'),
        content: Schema.string().role('textarea'),
      }),
    ]),
  ])

  export interface Config {
    uiPath: string
    devMode: boolean
    cacheDir?: string
    open?: boolean
    head?: Head[]
    selfUrl: string
    apiPath: string
    heartbeat?: HeartbeatConfig
    dev?: Dev
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      uiPath: Schema.string().default(''),
      apiPath: Schema.string().default('/api'),
      selfUrl: Schema.string().role('link').default(''),
      open: Schema.boolean(),
      head: Schema.array(Head),
      heartbeat: Schema.object({
        interval: Schema.number().default(Time.second * 30),
        timeout: Schema.number().default(Time.minute),
      }),
      devMode: Schema.boolean().default(process.env.NODE_ENV === 'development').hidden(),
      cacheDir: Schema.string().default('cache/vite').hidden(),
      dev: Dev,
    }),
  ])
}

export default NodeWebUI
