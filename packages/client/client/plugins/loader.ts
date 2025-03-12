import { Ref, ref, shallowReactive } from 'vue'
import { Context } from '../context'
import { Service } from '../utils'
import { EffectScope } from 'cordis'
import { defineProperty, Dict } from 'cosmokit'
import { clientId } from '../data'

declare module '../context' {
  interface Context {
    $loader: LoaderService
    $entry: LoadState
  }
}

export type Disposable = () => void
export type Extension = (ctx: Context) => void

export function defineExtension(callback: Extension) {
  return callback
}

export function unwrapExports(module: any) {
  return module?.default || module
}

type LoaderFactory = (ctx: Context, url: string) => Promise<EffectScope>

function jsLoader(ctx: Context, exports: {}) {
  return ctx.plugin(unwrapExports(exports), ctx.$entry.data)
}

function cssLoader(ctx: Context, link: HTMLLinkElement) {
  document.head.appendChild(link)
  ctx.on('dispose', () => {
    document.head.removeChild(link)
  })
  return new Promise((resolve, reject) => {
    link.onload = resolve
    link.onerror = reject
  })
}

defineProperty(jsLoader, 'reusable', true)
defineProperty(cssLoader, 'reusable', true)

const loaders: Dict<LoaderFactory> = {
  async [`.css`](ctx, url) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    return ctx.plugin(cssLoader, link as any)
  },
  async [``](ctx, url) {
    const exports = await import(/* @vite-ignore */ url)
    return ctx.plugin(jsLoader, exports)
  },
}

export interface LoadState {
  forks: Dict<EffectScope>
  entryId?: string
  done: Ref<boolean>
  data: Ref
}

export default class LoaderService extends Service {
  public id?: string

  public entries: Dict<LoadState> = shallowReactive({})

  constructor(ctx: Context) {
    super(ctx, '$loader')

    ctx.on('entry:update', ({ id, data }) => {
      const entry = this.entries[id]
      if (!entry) return
      entry.data.value = data
    })

    ctx.on('entry:patch', ({ id, data, key }) => {
      const entry = this.entries[id]
      if (!entry) return
      let node = entry.data.value
      const parts: string[] = key ? key.split('.') : []
      while (parts.length) {
        const part = parts.shift()!
        node = node[part] ?? (parts.length || !Array.isArray(data) ? {} : [])
      }
      if (Array.isArray(data)) {
        node.push(...data)
      } else {
        Object.assign(node, data)
      }
    })
  }

  initTask = new Promise<void>((resolve) => {
    this.ctx.on('entry:init', async (value) => {
      const { serverId, entries } = value
      clientId.value = value.clientId
      if (this.id && serverId && this.id !== serverId as unknown) {
        return window.location.reload()
      }
      this.id = serverId

      await Promise.all(Object.entries(entries).map(([key, body]) => {
        if (this.entries[key]) {
          if (body) return console.warn(`Entry ${key} already exists`)
          for (const fork of Object.values(this.entries[key].forks)) {
            fork.dispose()
          }
          delete this.entries[key]
          return
        }

        const { files, entryId, data } = body
        const ctx = this.ctx.isolate('$entry')
        ctx.$entry = this.entries[key] = {
          done: ref(false),
          entryId,
          data: ref(data),
          forks: {},
        }

        const task = Promise.all(files.map(async (url) => {
          for (const ext in loaders) {
            if (!url.endsWith(ext)) continue
            try {
              ctx.$entry.forks[url] = await loaders[ext](ctx, url)
            } catch (e) {
              console.error(e)
            }
            return
          }
          console.error(`No loader found for ${url}`)
        }))
        task.then(() => this.entries[key].done.value = true)
      }))

      if (serverId) resolve()
    })
  })
}
