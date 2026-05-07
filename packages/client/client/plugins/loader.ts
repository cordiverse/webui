import { Ref, ref, shallowReactive, reactive } from 'vue'
import { Context, Fiber, Service } from 'cordis'
import { defineProperty, Dict } from 'cosmokit'
import { apply, DeltaState } from '@cordisjs/muon'

declare module 'cordis' {
  interface Context {
    $loader: LoaderService
    $entry: LoadState | undefined
  }
}

export type Extension = (ctx: Context) => void

export function defineExtension(callback: Extension) {
  return callback
}

export function unwrapExports(module: any) {
  return module?.default || module
}

type LoaderFactory = (ctx: Context, url: string) => Promise<Fiber>

function jsLoader(ctx: Context, exports: {}) {
  return ctx.plugin(unwrapExports(exports), ctx.$entry!.data)
}

function cssLoader(ctx: Context, link: HTMLLinkElement) {
  ctx.effect(() => {
    document.head.appendChild(link)
    return () => {
      document.head.removeChild(link)
    }
  }, 'Node.appendChild')
  return new Promise((resolve, reject) => {
    link.onload = resolve
    link.onerror = reject
  })
}

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
  fibers: Dict<Fiber>
  entryId?: string
  done: Ref<boolean>
  data: Ref
  state: DeltaState
}

export default class LoaderService {
  public version?: string

  public entries = shallowReactive<Dict<LoadState>>({})

  public initTask: Promise<void>

  constructor(public ctx: Context) {
    defineProperty(this, Service.tracker, {
      property: 'ctx',
    })

    ctx.on('entry:delta', ({ id, ...delta }) => {
      const entry = this.entries[id]
      if (!entry) return
      const mutation = entry.state.load(delta)
      apply(entry.data.value, mutation)
    })

    this.initTask = new Promise((resolve) => {
      this.ctx.on('entry:init', async (value) => {
        const { version, entries } = value
        if (this.version && version && this.version !== version) {
          return window.location.reload()
        }
        this.version = version

        await Promise.all(Object.entries(entries).map(([key, body]) => {
          if (this.entries[key]) {
            for (const fiber of Object.values(this.entries[key].fibers)) {
              fiber.dispose()
            }
            delete this.entries[key]
          }
          if (!body) return

          const { files, entryId, data, cursor } = body
          const state = new DeltaState()
          if (cursor) state.restore(cursor)
          const $entry: LoadState = this.entries[key] = {
            done: ref(false),
            entryId,
            data: ref(data && typeof data === 'object' ? reactive(data) : data),
            fibers: {},
            state,
          }
          const ctx = this.ctx.extend({ $entry })
  
          const task = Promise.all(files.map(async (url) => {
            for (const ext in loaders) {
              if (!url.endsWith(ext)) continue
              try {
                ctx.$entry!.fibers[url] = await loaders[ext](ctx, url)
              } catch (e) {
                console.error(`[loader] failed to load ${url}:`, e)
              }
              return
            }
            console.error(`No loader found for ${url}`)
          }))
          task.then(() => this.entries[key].done.value = true)
        }))
  
        if (version) resolve()
      })
    })
  }
}
