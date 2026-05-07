import { Context, Inject, Service } from 'cordis'
import { Dict, Time } from 'cosmokit'
import type {} from '@cordisjs/plugin-logger'
import type {} from '@cordisjs/plugin-server'
import type {} from '@cordisjs/plugin-hmr'
import type { EntryOptions } from '@cordisjs/plugin-loader'
import type { FileSystemServeOptions, Logger as ViteLogger, Manifest, ViteDevServer } from 'vite'
import { extname, join, relative, resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse } from 'es-module-lexer'
import fetchFile from '@cordisjs/fetch-file'
import { Entry, Events, WebUI } from './base'
import open from 'open'
import z from 'schemastery'

declare module 'cordis' {
  interface EnvData {
    clientCount?: number
  }
}

export * from './base'

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
  plugins?: EntryOptions[]
}

interface HeartbeatConfig {
  interval?: number
  timeout?: number
}

@Inject('server')
class NodeWebUI extends WebUI {
  public vite?: ViteDevServer
  public root: string

  constructor(public ctx: Context, public config: NodeWebUI.Config) {
    super(ctx)

    ctx.on('webui/connection', () => {
      const loader = ctx.get('loader')
      if (!loader) return
      loader.envData.clientCount = this.clients.size
    })

    ctx.on('hmr/change', (url) => {
      for (const entry of Object.values(this.entries)) {
        if (entry.manifestUrl !== url) continue
        const path = relative(ctx.get('hmr')!.baseDir, fileURLToPath(url))
        ctx.logger('hmr').info('reload webui entry manifest at %c', path)
        entry.refresh()
      }
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
    return global
  }

  async [Service.init]() {
    if (this.config.devMode) await this.createVite()
    this.serveAssets()

    this.ctx.server.ws(this.config.apiPath, async (req, next) => {
      const socket = await next()
      this.accept(socket as any)
    })

    const target = this.ctx.server.baseUrl + this.config.uiPath
    const loader = this.ctx.get('loader')
    if (this.config.open && !loader?.envData.clientCount && !process.env.CORDIS_AGENT) {
      open(target)
    }
    this.ctx.logger.info('webui is available at %c', target)
  }

  addListener<K extends keyof Events>(event: K, callback: Events[K]) {
    this.ctx.server.post(`${this.config.apiPath}/${event}`, async (req, res, next) => {
      const args = await req.json() as any[]
      try {
        res.body = JSON.stringify(await (callback as any)(...args) ?? {})
        res.headers.set('content-type', 'application/json; charset=utf-8')
        res.status = 200
      } catch (error) {
        this.ctx.logger.warn(error)
        res.status = 500
      }
    })
  }

  getEntryFiles(entry: Entry) {
    if (this.config.devMode && entry.files.dev) {
      const filename = fileURLToPath(new URL(entry.files.dev, entry.files.base))
      if (existsSync(filename)) return [`/vite/@fs/${filename}`]
    }
    const filename = fileURLToPath(new URL(entry.files.prod, entry.files.base))
    return Object.values(entry.getManifest())
      .filter((chunk) => !chunk.isDynamicEntry)
      .map((chunk) => {
        if (this.config.devMode) {
          return `/vite/@fs/${resolve(filename, '..', chunk.file)}`
        } else {
          return `${this.config.uiPath}/-/modules/${entry.files.path ?? entry.id}/${chunk.file}`
        }
      })
  }

  private serveAssets() {
    this.ctx.server.get('{/*path}', async (req, res, next) => {
      const innerResponse = await next()
      if (innerResponse || res.claimed) return innerResponse

      const name = req.params.path ?? ''
      if (name.startsWith('-/modules/')) {
        for (const entry of Object.values(this.entries)) {
          const key = entry.files.path ?? entry.id
          if (!name.startsWith(`-/modules/${key}/`)) continue

          const file = name.slice(11 + key.length)
          const prodBase = fileURLToPath(new URL(entry.files.prod, entry.files.base))
          const manifest: Manifest = JSON.parse(readFileSync(prodBase, 'utf-8'))
          const chunkNames = Object.values(manifest).map(chunk => chunk.file)
          if (!chunkNames.includes(file)) continue

          const filename = resolve(prodBase, '..', file)
          if (this.config.devMode || !['.js', '.mjs'].includes(extname(file))) {
            return fetchFile(pathToFileURL(filename), {}, {
              onError: this.ctx.logger.warn,
            })
          }

          // we only transform js imports in production mode
          const source = await readFile(filename, 'utf-8')
          res.status = 200
          res.headers.set('content-type', 'application/javascript; charset=utf-8')
          res.body = await this.transformImport(source)
          return
        }
        res.status = 404
        return
      }

      const filename = join(this.root, name)
      if (!filename.startsWith(this.root) && !filename.includes('node_modules')) {
        res.status = 404
        return
      }

      const fileResponse = await fetchFile(pathToFileURL(filename), {}, {
        onError: this.ctx.logger.warn,
      })
      if (fileResponse.status !== 404) return fileResponse

      // fallback to index.html
      if (!req.accepts('text/html; charset=utf-8')) {
        res.status = 404
        return
      }
      const template = await readFile(resolve(this.root, 'index.html'), 'utf-8')
      res.status = 200
      res.headers.set('content-type', 'text/html; charset=utf-8')
      res.body = await this.transformHtml(template)
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
      '@cordisjs/client': this.config.uiPath + '/client.js',
    })[name] ?? name
  }

  private async transformImport(source: string) {
    let output = '', lastIndex = 0
    const [imports] = parse(source)
    for (const { s, e, n, t } of imports) {
      const resolved = this.resolveImport(n)
      output += source.slice(lastIndex, s) + (t === 2 ? JSON.stringify(resolved) : resolved)
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

    const logger = this.ctx.logger('vite')
    const hmrLogger = this.ctx.logger('vite:hmr')
    const baseDir = fileURLToPath(this.ctx.baseUrl!)
    const ansiRegex = /\x1B\[[0-9;]*m/g
    const loggedWarnings = new Set<string>()
    const loggedErrors = new WeakSet<object>()
    const customLogger: ViteLogger = {
      hasWarned: false,
      info: (message) => {
        const plain = message.replace(ansiRegex, '')
        const match = /^hmr update\s+(.+)$/.exec(plain)
        if (match) {
          const files = match[1].split(/,\s*/).map((file) => {
            const abs = file.startsWith('/@fs')
              ? file.slice(4)
              : resolve(this.root, file.replace(/^\//, ''))
            return relative(baseDir, abs)
          })
          hmrLogger.info('update %s', files.join(', '))
          return
        }
        logger.info(message)
      },
      warn: (message) => {
        customLogger.hasWarned = true
        logger.warn(message)
      },
      warnOnce: (message) => {
        if (loggedWarnings.has(message)) return
        loggedWarnings.add(message)
        customLogger.hasWarned = true
        logger.warn(message)
      },
      error: (message, options) => {
        if (options?.error) loggedErrors.add(options.error)
        logger.error(message)
      },
      clearScreen: () => {},
      hasErrorLogged: (error) => loggedErrors.has(error),
    }

    this.vite = await createServer(fileURLToPath(this.ctx.baseUrl!), {
      cacheDir: cacheDir && fileURLToPath(new URL(cacheDir, this.ctx.baseUrl)),
      server: {
        fs: dev?.fs,
        allowedHosts: true,
      },
      customLogger,
      plugins: [{
        name: 'cordis-hmr',
        transform: (code, id, options) => {
          for (const [key, entry] of Object.entries(this.entries)) {
            if (!entry.files.dev) continue
            const filename = fileURLToPath(new URL(entry.files.dev, entry.files.base))
            if (id !== filename) continue
            code += [
              'if (import.meta.hot) {',
              '  import.meta.hot.accept(async (module) => {',
              '    const { root } = await import("@cordisjs/client");',
              `    const fiber = root.$loader.entries["${key}"]?.forks["${id}"];`,
              '    return fiber?.update(module, true);',
              '  });',
              '}',
            ].join('\n') + '\n'
            return { code }
          }
        },
      }],
    })

    this.ctx.server.use(async (req, res, next) => {
      if (!req.url.startsWith('/vite/')) return next()
      await new Promise<void>((resolve, reject) => {
        res._res.once('close', () => resolve())
        this.vite!.middlewares(req._req, res._res, (err: any) => {
          if (err) return reject(err)
          next().then(resolve, reject)
        })
      })
    })

    this.ctx.effect(() => () => this.vite?.close(), 'vite.createServer()')
  }
}

namespace NodeWebUI {
  export interface Dev {
    fs: FileSystemServeOptions
  }

  export const Dev: z<Dev> = z.object({
    fs: z.object({
      strict: z.boolean().default(true),
      // FIXME fix typings
      allow: z.array(String).default(null as any),
      deny: z.array(String).default(null as any),
    }).hidden(),
  })

  export interface Head {
    tag: string
    attrs?: Dict<string>
    content?: string
  }

  export const Head: z<Head> = z.intersect([
    z.object({
      tag: z.union([
        'title',
        'link',
        'meta',
        'script',
        'style',
        z.string(),
      ]).required(),
    }),
    z.union([
      z.object({
        tag: z.const('title').required(),
        content: z.string().role('textarea'),
      }),
      z.object({
        tag: z.const('link').required(),
        attrs: z.dict(z.string()).role('table'),
      }),
      z.object({
        tag: z.const('meta').required(),
        attrs: z.dict(z.string()).role('table'),
      }),
      z.object({
        tag: z.const('script').required(),
        attrs: z.dict(z.string()).role('table'),
        content: z.string().role('textarea'),
      }),
      z.object({
        tag: z.const('style').required(),
        attrs: z.dict(z.string()).role('table'),
        content: z.string().role('textarea'),
      }),
      z.object({
        tag: z.string().required(),
        attrs: z.dict(z.string()).role('table'),
        content: z.string().role('textarea'),
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

  export const Config: z<Config> = z.intersect([
    z.object({
      uiPath: z.string().default(''),
      apiPath: z.string().default('/api'),
      selfUrl: z.string().role('link').default(''),
      open: z.boolean(),
      head: z.array(Head),
      heartbeat: z.object({
        interval: z.number().default(Time.second * 30),
        timeout: z.number().default(Time.minute),
      }),
      devMode: z.boolean().default(process.env.NODE_ENV === 'development').hidden(),
      cacheDir: z.string().default('cache/vite').hidden(),
      dev: Dev,
    }),
  ])
}

export default NodeWebUI
