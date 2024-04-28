import { Ref, ref, shallowReactive, watch } from 'vue'
import { Context } from '../context'
import { Service } from '../utils'
import { receive, store } from '../data'
import { ForkScope } from 'cordis'
import { Dict } from 'cosmokit'

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
  return ctx.plugin(unwrapExports(exports), ctx.$entry.data)
}

function cssLoader(ctx: Context, link: HTMLLinkElement) {
  ctx.effect(() => {
    document.head.appendChild(link)
    return () => document.head.removeChild(link)
  })
}

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
  fork?: ForkScope
  paths: string[]
  done: Ref<boolean>
  data: Ref
}

export default class LoaderService extends Service {
  private backendId: any

  public extensions: Dict<LoadState> = shallowReactive({})

  constructor(ctx: Context) {
    super(ctx, '$loader', true)

    receive('entry-data', ({ id, data }) => {
      const entry = store.entry?.[id]
      if (!entry) return
      entry.data = data
      this.extensions[id].data.value = data
    })
  }

  initTask = new Promise<void>((resolve) => {
    watch(() => store.entry, async (newValue, oldValue) => {
      const { _id, ...rest } = newValue || {}
      if (this.backendId && _id && this.backendId !== _id) {
        window.location.reload()
        return
      }
      this.backendId = _id

      for (const key in this.extensions) {
        if (rest[key]) continue
        this.extensions[key].fork?.dispose()
        delete this.extensions[key]
      }

      await Promise.all(Object.entries(rest).map(([key, { files, paths, data }]) => {
        if (this.extensions[key]) return
        const ctx = this.ctx.isolate('$entry')
        ctx.$entry = this.extensions[key] = { done: ref(false), paths, data: ref(data) }

        const task = Promise.all(files.map(async (url) => {
          for (const ext in loaders) {
            if (!url.endsWith(ext)) continue
            ctx.$entry.fork = await loaders[ext](ctx, url)
          }
        }))
        task.finally(() => this.extensions[key].done.value = true)
      }))

      if (!oldValue) resolve()
    }, { deep: true })
  })
}
