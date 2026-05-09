import { Context, Disposable, Service } from 'cordis'
import { App, Component, inject, InjectionKey, isRef, markRaw, MaybeRefOrGetter, reactive, ref, Ref, shallowRef, toValue } from 'vue'
import { global } from '../data'
import { defineProperty, Dict, omit, remove } from 'cosmokit'
import { insert } from '../utils'
import { SlotOptions } from '../components'

declare module '@cordisjs/client' {
  interface RouteMeta {
    activity?: Activity
  }
}

declare module 'cordis' {
  interface Events {
    'activity'(activity: Activity): boolean
  }
}

export interface RouteMeta {}

export interface RouteRecord {
  path: string
  name?: string
  component: Component
  meta: RouteMeta
  regex: RegExp
  keys: string[]
}

export interface RouteLocation {
  path: string
  fullPath: string
  query: Dict<string>
  params: Dict<string>
  name?: string
  meta: RouteMeta
  matched: RouteRecord[]
}

export type NavigationTarget = string | { path?: string; query?: Dict<string | undefined> }
export type BeforeGuard = (to: RouteLocation, from: RouteLocation) => any | Promise<any>
export type AfterGuard = (to: RouteLocation, from: RouteLocation) => void

export const INITIAL: RouteLocation = {
  path: '',
  fullPath: '',
  query: {},
  params: {},
  meta: {},
  matched: [],
}

export const kRoute = Symbol('cordis.client.route') as InjectionKey<Ref<RouteLocation>>
export const kRouter = Symbol('cordis.client.router') as InjectionKey<Router>

function compilePath(path: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = []
  // Wildcard `:name*` consumes the preceding `/` and matches 0+ segments (incl '/').
  // Plain `:name` matches one segment (no '/').
  const pattern = path.replace(/\/:(\w+)\*/g, (_, name) => {
    keys.push(name)
    return '(?:/(.*))?'
  }).replace(/:(\w+)/g, (_, name) => {
    keys.push(name)
    return '([^/]+)'
  })
  return { regex: new RegExp('^' + pattern + '/?$'), keys }
}

function parseUrl(input: string): { path: string; query: Dict<string> } {
  const i = input.indexOf('?')
  if (i < 0) return { path: input, query: {} }
  const query: Dict<string> = {}
  for (const [k, v] of new URLSearchParams(input.slice(i + 1))) query[k] = v
  return { path: input.slice(0, i), query }
}

function stringifyQuery(query: Dict<string | undefined>): string {
  const parts: string[] = []
  for (const k in query) {
    if (query[k] === undefined) continue
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(query[k]!))
  }
  return parts.length ? '?' + parts.join('&') : ''
}

export class Router {
  public records: RouteRecord[] = []
  // shallowRef so `currentRoute.value === INITIAL` works as a sentinel; ref()
  // wraps the value in a reactive proxy and breaks identity. We always replace
  // .value with a fresh RouteLocation so deep reactivity is unneeded anyway.
  public currentRoute = shallowRef<RouteLocation>(INITIAL)
  private _before: BeforeGuard[] = []
  private _after: AfterGuard[] = []

  constructor(public base: string) {
    window.addEventListener('popstate', () => {
      const url = location.pathname.slice(this.base.length) + location.search
      this._navigate(url, true).catch(console.error)
    })
  }

  resolve(target: NavigationTarget): RouteLocation {
    let path: string, query: Dict<string>
    if (typeof target === 'string') {
      ({ path, query } = parseUrl(target))
    } else {
      path = target.path ?? this.currentRoute.value.path
      query = {}
      for (const k in target.query ?? {}) {
        if (target.query![k] !== undefined) query[k] = target.query![k]!
      }
    }
    for (const record of this.records) {
      const m = record.regex.exec(path)
      if (!m) continue
      const params: Dict<string> = {}
      record.keys.forEach((key, i) => params[key] = m[i + 1] ?? '')
      const fullPath = path + stringifyQuery(query)
      return { path, fullPath, query, params, name: record.name, meta: record.meta, matched: [record] }
    }
    const fullPath = path + stringifyQuery(query)
    return { path, fullPath, query, params: {}, meta: {}, matched: [] }
  }

  addRoute(record: Omit<RouteRecord, 'regex' | 'keys'>): () => void {
    const { regex, keys } = compilePath(record.path)
    const full: RouteRecord = { ...record, regex, keys }
    this.records.push(full)
    return () => remove(this.records, full)
  }

  beforeEach(guard: BeforeGuard): () => void {
    this._before.push(guard)
    return () => remove(this._before, guard)
  }

  afterEach(guard: AfterGuard): () => void {
    this._after.push(guard)
    return () => remove(this._after, guard)
  }

  push(target: NavigationTarget): Promise<void> {
    return this._navigate(this.resolve(target).fullPath, false)
  }

  replace(target: NavigationTarget): Promise<void> {
    return this._navigate(this.resolve(target).fullPath, true)
  }

  private async _navigate(fullPath: string, replace: boolean): Promise<void> {
    const from = this.currentRoute.value
    let to = this.resolve(fullPath)
    for (const guard of this._before) {
      const r = await guard(to, from)
      if (r === false) return
      if (typeof r === 'string' || (r && typeof r === 'object')) {
        to = this.resolve(r)
      }
    }
    const url = this.base + to.fullPath
    if (replace || from === INITIAL) {
      history.replaceState(null, '', url)
    } else {
      history.pushState(null, '', url)
    }
    this.currentRoute.value = to
    for (const guard of this._after) guard(to, from)
  }

  async ready(): Promise<void> {
    if (this.currentRoute.value !== INITIAL) return
    const url = location.pathname.slice(this.base.length) + location.search
    await this._navigate(url || '/', true)
  }

  install(app: App): void {
    app.provide(kRouter, this)
    app.provide(kRoute, this.currentRoute)
  }
}

export function useRoute(): RouteLocation {
  const route = inject(kRoute)!
  return new Proxy({} as RouteLocation, {
    get: (_, key) => (route.value as any)[key],
    has: (_, key) => key in route.value,
    ownKeys: () => Reflect.ownKeys(route.value),
    getOwnPropertyDescriptor: (_, key) => Reflect.getOwnPropertyDescriptor(route.value, key),
  })
}

export function useRouter(): Router {
  return inject(kRouter)!
}

export namespace Activity {
  export interface Options {
    id?: string
    path: string
    strict?: boolean
    component: Component
    name: MaybeRefOrGetter<string>
    desc?: MaybeRefOrGetter<string>
    icon?: MaybeRefOrGetter<string | Component | undefined>
    order?: number
    authority?: number
    position?: 'top' | 'bottom'
    disabled?: () => boolean | undefined
  }
}

export interface Activity extends Activity.Options {}

function getActivityId(path: string) {
  return path.replace(/^\//, '') || ''
}

export class Activity {
  id!: string
  _disposables: Disposable[] = []

  constructor(public ctx: Context, public options: Activity.Options) {
    options.order ??= 0
    options.position ??= 'top'
    Object.assign(this, omit(options, ['icon', 'name', 'desc', 'disabled']))
  }

  *setup() {
    const { path, id = getActivityId(path), component } = this.options
    yield this.ctx.client.router.router.addRoute({ path, name: id, component, meta: { activity: this } })
    this.id ??= id
    this.authority ??= 0
    this.ctx.client.router.pages[this.id] = this
    yield () => delete this.ctx.client.router.pages[this.id]
    this.handleUpdate()
    yield () => {
      const router = this.ctx.client.router
      const { meta, fullPath } = router.router.currentRoute.value
      this._disposables.forEach(dispose => dispose())
      if (meta?.activity === this) {
        router.redirectTo.value = fullPath
        router.router.replace(router.cache['home'] || '/')
      }
    }
  }

  handleUpdate() {
    const router = this.ctx.client.router
    if (router.redirectTo.value) {
      const location = router.router.resolve(router.redirectTo.value)
      if (location.matched.length) {
        router.redirectTo.value = undefined
        router.router.replace(location.fullPath)
      }
    }
  }

  get icon() {
    return toValue(this.options.icon) ?? 'activity:default'
  }

  get name() {
    return toValue(this.options.name ?? this.id)
  }

  get desc() {
    return toValue(this.options.desc)
  }

  disabled() {
    if (this.ctx.bail('activity', this)) return true
    if (this.options.disabled?.()) return true
  }
}

export default class RouterService {
  public views = reactive<Dict<SlotOptions[]>>({})
  public cache = reactive<Record<keyof any, string>>({})
  public pages = reactive<Dict<Activity>>({})
  public router = new Router(global.uiPath)
  public redirectTo = ref<string>()

  constructor(public ctx: Context) {
    defineProperty(this, Service.tracker, {
      property: 'ctx',
    })

    ctx.effect(() => {
      const initialTitle = document.title
      const dispose = this.router.afterEach((route) => {
        const { name, fullPath } = this.router.currentRoute.value
        if (name) this.cache[name] = fullPath
        if (route.meta.activity) {
          document.title = `${route.meta.activity.name}`
          if (initialTitle) document.title += ` | ${initialTitle}`
        }
      })
      return () => {
        document.title = initialTitle
        dispose()
      }
    })

    ctx.effect(() => this.router.beforeEach(async (to, from) => {
      if (to.matched.length) {
        if (to.matched[0].path !== '/') {
          this.redirectTo.value = undefined
        }
        return
      }

      if (from === INITIAL) {
        await ctx.client.loader.initTask
        const resolved = this.router.resolve(to.fullPath)
        if (resolved.matched.length) return resolved.fullPath
      }

      this.redirectTo.value = to.fullPath
      const result = this.cache['home'] || '/'
      if (result === to.fullPath) return
      return result
    }))
  }

  slot(options: SlotOptions) {
    options.order ??= 0
    options.component = this.ctx.client.wrapComponent(options.component)
    return this.ctx.effect(() => {
      const list = this.views[options.type] ||= []
      insert(list, options)
      return () => {
        remove(list, options)
        if (!list.length) delete this.views[options.type]
      }
    })
  }

  page(options: Activity.Options) {
    options.component = this.ctx.client.wrapComponent(options.component)
    if (options.icon && typeof options.icon === 'object' && !isRef(options.icon)) {
      markRaw(options.icon)
    }
    return this.ctx.effect(() => {
      const activity = new Activity(this.ctx, options)
      return activity.setup()
    })
  }
}
