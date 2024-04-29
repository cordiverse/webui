import { Ref, ref, shallowReactive } from 'vue'
import { Context } from '../context'
import { Service } from '../utils'
import { receive } from '../data'
import { ForkScope } from 'cordis'
import { defineProperty, Dict } from 'cosmokit'
import { Entry } from '@cordisjs/plugin-webui'

declare module '../context' {
  interface Context {
    $loader: LoaderService
    $entry?: LoadState
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

type LoaderFactory = (ctx: Context, url: string) => Promise<ForkScope>

function jsLoader(ctx: Context, exports: {}) {
  return ctx.plugin(unwrapExports(exports), ctx.$entry!.data)
}

function cssLoader(ctx: Context, link: HTMLLinkElement) {
  ctx.effect(() => {
    document.head.appendChild(link)
    return () => document.head.removeChild(link)
  })
}

defineProperty(jsLoader, 'reusable', true)
defineProperty(cssLoader, 'reusable', true)

const loaders: Dict<LoaderFactory> = {
  async [`.css`](ctx, url) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    await new Promise((resolve, reject) => {
      link.onload = resolve
      link.onerror = reject
    })
    return ctx.plugin(cssLoader, link)
  },
  async [``](ctx, url) {
    const exports = await import(/* @vite-ignore */ url)
    return ctx.plugin(jsLoader, exports)
  },
}

export interface LoadState {
  forks: ForkScope[]
  paths: string[]
  done: Ref<boolean>
  data: Ref
}

export default class LoaderService extends Service {
  public id?: string

  public entries: Dict<LoadState> = shallowReactive({})

  constructor(ctx: Context) {
    super(ctx, '$loader', true)

    receive('entry:refresh', ({ id, data }) => {
      const entry = this.entries[id]
      if (!entry) return
      entry.data.value = data
    })

    receive('entry:patch', ({ id, data, key }) => {
      const entry = this.entries[id]
      if (!entry) return
      let node = entry.data.value
      const parts: string[] = key ? key.split('.') : []
      while (parts.length) {
        const part = parts.shift()!
        node = node[part]
      }
      Object.assign(node, data)
    })
  }

  initTask = new Promise<void>((resolve) => {
    receive('entry:init', async (value) => {
      const { _id, ...rest } = value as Dict<Entry.Data> & { _id?: string }
      if (this.id && _id && this.id !== _id as unknown) {
        return window.location.reload()
      }
      this.id = _id

      for (const key in this.entries) {
        if (rest[key]) continue
        for (const fork of this.entries[key].forks) {
          fork?.dispose()
        }
        delete this.entries[key]
      }

      await Promise.all(Object.entries(rest).map(([key, { files, paths = [], data }]) => {
        if (this.entries[key]) return
        const ctx = this.ctx.isolate('$entry')
        ctx.$entry = this.entries[key] = { done: ref(false), paths, data: ref(data), forks: [] }

        const task = Promise.allSettled(files.map(async (url, index) => {
          for (const ext in loaders) {
            if (!url.endsWith(ext)) continue
            ctx.$entry!.forks[index] = await loaders[ext](ctx, url)
          }
        }))
        task.then(() => this.entries[key].done.value = true)
      }))

      if (_id) resolve()
    })
  })
}
