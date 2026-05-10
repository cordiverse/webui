import { Context, Service } from 'cordis'
import { App, Component, inject, InjectionKey, isRef, markRaw, MaybeRefOrGetter, reactive, ref, Ref, shallowRef, toValue, watch } from 'vue'
import { pathToRegexp } from 'path-to-regexp'
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
    // Pattern syntax (path-to-regexp v8): `:name` single segment,
    // `*name` zero+ segments wildcard (use `{/*name}` for an optional
    // wildcard segment, `{/:name}` for an optional single segment).
    const { regexp: regex, keys } = pathToRegexp(record.path)
    const full: RouteRecord = { ...record, regex, keys: keys.map((k) => k.name) }
    this.records.push(full)
    // If currentRoute is unmatched and the new record would cover it,
    // swap it in. Symmetric with the remove path below: every record
    // change re-evaluates currentRoute against the live record table.
    // Internal swap — bypasses history ops + before/after guards; the
    // title-update / cache-fill side effects are driven off a `watch` on
    // currentRoute (in RouterService) so they fire either way.
    const cur = this.currentRoute.value
    if (cur !== INITIAL && !cur.matched.length) {
      const resolved = this.resolve(cur.fullPath)
      if (resolved.matched.length) {
        this.currentRoute.value = resolved
      }
    }
    return () => {
      remove(this.records, full)
      // Mirror the add path: if currentRoute was matched against this
      // record, re-resolve so matched[] reflects the now-shrunk table.
      if (this.currentRoute.value.matched[0] === full) {
        this.currentRoute.value = this.resolve(this.currentRoute.value.fullPath)
      }
    }
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
    const resolved = this.resolve(target)
    if (!resolved.matched.length) {
      throw new Error(`router.push: no route matches "${resolved.fullPath}"`)
    }
    return this._navigate(resolved.fullPath, false)
  }

  replace(target: NavigationTarget): Promise<void> {
    const resolved = this.resolve(target)
    if (!resolved.matched.length) {
      throw new Error(`router.replace: no route matches "${resolved.fullPath}"`)
    }
    return this._navigate(resolved.fullPath, true)
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

  constructor(public ctx: Context) {
    defineProperty(this, Service.tracker, {
      property: 'ctx',
    })

    // Drive title + cache off currentRoute (not afterEach) so internal
    // re-resolves from `addRoute` add/remove also update them. afterEach
    // only fires from `_navigate` (push/replace/popstate); reactive
    // record-table swaps would otherwise leak stale titles.
    ctx.effect(() => {
      const initialTitle = document.title
      const stop = watch(this.router.currentRoute, (route) => {
        const { name, fullPath } = route
        if (name) this.cache[name] = fullPath
        if (route.meta.activity) {
          document.title = `${route.meta.activity.name}`
          if (initialTitle) document.title += ` | ${initialTitle}`
        }
      }, { immediate: true })
      return () => {
        document.title = initialTitle
        stop()
      }
    })
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
