import { createRouter, createWebHistory, RouteLocation, START_LOCATION } from 'vue-router'
import { Context, Service } from 'cordis'
import { insert } from '../utils'
import { Component, MaybeRefOrGetter, reactive, ref, toValue } from 'vue'
import { global } from '../data'
import { defineProperty, Dict, omit, remove } from 'cosmokit'
import { Disposable } from 'cordis'
import { SlotOptions } from '../components'

declare module 'vue-router' {
  interface RouteMeta {
    activity?: Activity
  }
}

declare module 'cordis' {
  interface Events {
    'activity'(activity: Activity): boolean
  }
}

export namespace Activity {
  export interface Options {
    id?: string
    path: string
    strict?: boolean
    component: Component
    name: MaybeRefOrGetter<string>
    desc?: MaybeRefOrGetter<string>
    icon?: MaybeRefOrGetter<string>
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

export const redirectTo = ref<string>()

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
      const { meta, fullPath } = this.ctx.client.router.router.currentRoute.value
      this._disposables.forEach(dispose => dispose())
      if (meta?.activity === this) {
        redirectTo.value = fullPath
        this.ctx.client.router.router.replace(this.ctx.client.router.cache['home'] || '/')
      }
    }
  }

  handleUpdate() {
    if (redirectTo.value) {
      const location = this.ctx.client.router.router.resolve(redirectTo.value)
      if (location.matched.length) {
        redirectTo.value = undefined
        this.ctx.client.router.router.replace(location)
      }
    }
  }

  get icon() {
    return toValue(this.options.icon ?? 'activity:default')
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
  public router = createRouter({
    history: createWebHistory(global.uiPath),
    linkActiveClass: 'active',
    routes: [],
  })

  constructor(public ctx: Context) {
    defineProperty(this, Service.tracker, {
      property: 'ctx',
    })

    ctx.effect(() => {
      const initialTitle = document.title
      const dispose = this.router.afterEach((route) => {
        const { name, fullPath } = this.router.currentRoute.value
        this.cache[name!] = fullPath
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

    ctx.effect(() => this.router.beforeEach(async (to: RouteLocation, from) => {
      if (to.matched.length) {
        if (to.matched[0].path !== '/') {
          redirectTo.value = undefined
        }
        return
      }

      if (from === START_LOCATION) {
        await ctx.client.loader.initTask
        to = this.router.resolve(to)
        if (to.matched.length) return to
      }

      redirectTo.value = to.fullPath
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
    return this.ctx.effect(() => {
      const activity = new Activity(this.ctx, options)
      return activity.setup()
    })
  }
}
