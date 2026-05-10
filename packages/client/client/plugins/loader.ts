import { Ref, ref, shallowReactive } from 'vue'
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

// Install RPC closures for each top-level method on `target`. Idempotent —
// safe to call after every `entry:init` and after any root-replace mutation
// that rebuilds the data object. Defines non-enumerable so muon delta `apply`
// never tries to read or replace these keys (server side never serializes
// them in the first place).
function injectMethods(
  ctx: Context,
  entryRandomId: string,
  target: any,
  methods: string[] | undefined,
) {
  if (!target || typeof target !== 'object' || !methods?.length) return
  for (const name of methods) {
    Object.defineProperty(target, name, {
      value: (...args: any[]) => ctx.client.rpc.call(entryRandomId, name, args),
      enumerable: false,
      configurable: true,
      writable: false,
    })
  }
}

export default class LoaderService {
  public version?: string

  public entries = shallowReactive<Dict<LoadState>>({})

  /**
   * Resolves after the first `entry:init` registers all entry data + methods.
   * Gates `ctx.client.mount()` (i.e. first paint).
   */
  public initTask: Promise<void>

  /**
   * Reactive flag: are all known entries' modules imported and applied?
   *
   * Driven by:
   * - `_initFired` (one-shot, flips on first `entry:init`)
   * - `_pending` (counter of in-flight module-import tasks)
   *
   * `ready = _initFired && _pending === 0`. Used by the route view as the
   * sole signal between "loading" (still importing modules — could be
   * initial boot or a runtime-added entry) and "404" (everything we know
   * about is loaded but the URL still doesn't match anything).
   *
   * Intentionally separate from `initTask`: `initTask` resolves after the
   * first batch of entry data lands so first paint isn't gated on module
   * latency, while `ready` keeps tracking module loads even after first
   * paint and after first paint and across runtime entry changes.
   */
  public ready = ref(false)

  /**
   * HTTP status code of the document navigation request (read once at
   * construct time). The server returns 404 for SPA paths that no entry's
   * `routes` covers — when we see that here, we can render NotFound
   * immediately even if `ready` is still false because some sibling entry's
   * module is in-flight or stuck. Pure optimisation; subsequent SPA-internal
   * navigation doesn't refresh this value.
   */
  public initialStatus: number | undefined

  // Map of webui Entry.id → method names (kept so we can re-inject after a
  // root replace mutation rebuilds entry.data.value).
  private _methods: Dict<string[]> = Object.create(null)
  private _pending = 0
  private _initFired = false

  private _bumpPending(delta: number) {
    this._pending += delta
    this.ready.value = this._initFired && this._pending === 0
  }

  constructor(public ctx: Context) {
    defineProperty(this, Service.tracker, {
      property: 'ctx',
    })

    // Read once: PerformanceNavigationTiming.responseStatus (Chrome 102+,
    // Firefox 110+, Safari 16.4+). Best-effort — stays `undefined` in
    // happy-dom / node and the theme view falls back to the slower
    // ready-based decision.
    if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
      const nav = performance.getEntriesByType('navigation')[0] as
        (PerformanceNavigationTiming & { responseStatus?: number }) | undefined
      this.initialStatus = nav?.responseStatus
    }

    ctx.on('entry:delta', ({ id, ...delta }) => {
      const entry = this.entries[id]
      if (!entry) return
      const mutation = entry.state.load(delta)
      const next = apply(entry.data.value, mutation)
      // Root replace: muon returns the new root value; rebind and re-inject methods.
      if (mutation.path.length === 0 && mutation.kind.type === 'replace') {
        entry.data.value = next
        injectMethods(this.ctx, id, entry.data.value, this._methods[id])
      }
    })

    this.initTask = new Promise((resolve) => {
      this.ctx.on('entry:init', async (value) => {
        const { version, entries } = value
        if (this.version && version && this.version !== version) {
          return window.location.reload()
        }
        this.version = version

        await Promise.all(Object.entries(entries).map(async ([key, body]) => {
          if (!body) {
            const $entry = this.entries[key]
            if ($entry) {
              delete this.entries[key]
              delete this._methods[key]
              for (const fiber of Object.values($entry.fibers)) {
                fiber.dispose()
              }
            }
            return
          }

          const { files, entryId, data, cursor, methods } = body
          const state = new DeltaState()
          if (cursor) state.restore(cursor)

          let $entry = this.entries[key]
          if ($entry) {
            for (const url of Object.keys($entry.fibers)) {
              if (files.includes(url)) continue
              $entry.fibers[url].dispose()
              delete $entry.fibers[url]
            }
            $entry.entryId = entryId
            $entry.data.value = data
            $entry.state = state
            $entry.done.value = false
          } else {
            $entry = this.entries[key] = {
              done: ref(false),
              entryId,
              data: ref(data),
              fibers: {},
              state,
            }
          }

          this._methods[key] = methods ?? []
          injectMethods(this.ctx, key, $entry.data.value, methods)

          const ctx = this.ctx.extend({ $entry })
          const pending = files.filter((url) => !$entry!.fibers[url])
          const task = Promise.all(pending.map(async (url) => {
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
          this._bumpPending(+1)
          // Decrement BEFORE touching $entry.done.value so that a downstream
          // Vue update triggered by `ready` flipping (or by `done` itself)
          // can't strand the counter. `finally` not `then`: defensive
          // against the inner try/catch above ever being removed —
          // otherwise a task rejection would leak the counter.
          task.finally(() => {
            this._bumpPending(-1)
            $entry!.done.value = true
          })
        }))

        if (version) {
          resolve()
          this._initFired = true
          // No-op delta to recompute `ready` now that the gate is open. If
          // every entry's modules are already cached/no-op, this flips
          // `ready` to true immediately; otherwise pending tasks will flip
          // it later via their `finally` hooks.
          this._bumpPending(0)
        }
      })
    })
  }
}
