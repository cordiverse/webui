import { Context, Service } from 'cordis'
import { Component, markRaw, MaybeRefOrGetter, reactive, shallowReactive, toValue } from 'vue'
import { useContext } from '../context'
import { defineProperty, Dict, Intersect, remove } from 'cosmokit'
import { insert } from '../utils'
import { ActionContext } from '..'

export interface ActionOptions {
  shortcut?: string
  hidden?: (scope: Flatten<ActionContext>) => boolean
  disabled?: (scope: Flatten<ActionContext>) => boolean
  action: (scope: Flatten<ActionContext>) => any
}

export type LegacyMenuItem = Partial<ActionOptions> & Omit<MenuItem, 'id'>

export interface MenuItem {
  id: string
  label?: MaybeGetter<string | undefined>
  type?: MaybeGetter<string | undefined>
  icon?: MaybeGetter<string | Component | undefined>
  order?: number
}

export type MaybeGetter<T> = T | ((scope: Flatten<ActionContext>) => T)

type Store<S extends {}> = { [K in keyof S]?: MaybeRefOrGetter<S[K]> }

type Flatten<S extends {}> = Intersect<{
  [K in keyof S]: K extends `${infer L}.${infer R}`
    ? { [P in L]: Flatten<{ [P in R]: S[K] }> }
    : { [P in K]: S[K] }
}[keyof S]>

export interface ActiveMenu {
  id: string
  relative: {
    left: number
    top: number
    right: number
    bottom: number
  }
}

export function useMenu<K extends keyof ActionContext>(id: K) {
  const ctx = useContext()
  return (event: MouseEvent, value?: MaybeRefOrGetter<ActionContext[K]>) => {
    ctx.client.action.define(id, value)
    event.preventDefault()
    const { clientX, clientY } = event
    ctx.client.action.activeMenus.splice(0, Infinity, {
      id,
      relative: {
        left: clientX,
        top: clientY,
        right: clientX,
        bottom: clientY,
      },
    })
  }
}

export default class ActionService {
  scope: Store<ActionContext> = shallowReactive({})
  menus: Dict<MenuItem[]> = reactive({})
  actions: Dict<ActionOptions> = reactive({})
  activeMenus: ActiveMenu[] = reactive([])

  constructor(public ctx: Context) {
    defineProperty(this, Service.tracker, {
      property: 'ctx',
    })

    ctx.client.addEventListener('keydown', (event) => {
      const scope = this.createScope()
      for (const action of Object.values(this.actions)) {
        if (!action.shortcut) continue
        const keys = action.shortcut.split('+').map(key => key.toLowerCase().trim())
        let ctrlKey = false, shiftKey = false, metaKey = false, code: string | undefined
        for (const key of keys) {
          switch (key) {
            case 'shift': shiftKey = true; continue
            case 'ctrl':
              if (navigator.platform.toLowerCase().includes('mac')) {
                metaKey = true
              } else {
                ctrlKey = true
              }
              continue
            default:
              code = key
          }
        }
        if (ctrlKey !== event.ctrlKey) continue
        if (shiftKey !== event.shiftKey) continue
        if (metaKey !== event.metaKey) continue
        if (code !== event.key.toLowerCase()) continue
        if (action.hidden?.(scope)) continue
        if (action.disabled?.(scope)) continue
        event.preventDefault()
        action.action(scope)
      }
    })
  }

  action(id: string, options: ActionOptions | ActionOptions['action']) {
    if (typeof options === 'function') options = { action: options }
    markRaw(options)
    return this.ctx.effect(() => {
      this.actions[id] = options
      return () => delete this.actions[id]
    })
  }

  menu(id: string, items: MenuItem[]) {
    for (const item of items) {
      if (item.icon && typeof item.icon === 'object') markRaw(item.icon)
    }
    return this.ctx.effect(() => {
      const list = this.menus[id] ||= []
      items.forEach(item => insert(list, item))
      return () => {
        items.forEach(item => remove(list, item))
        if (!list.length) delete this.menus[id]
      }
    })
  }

  define<K extends keyof ActionContext>(key: K, value?: MaybeRefOrGetter<ActionContext[K]>) {
    return this.ctx.effect(() => {
      this.scope[key] = value as any
      return () => delete this.scope[key]
    })
  }

  createScope(override = {}) {
    const scope = { ...this.scope, ...override }
    return createScope(scope)
  }
}

function createScope(scope: Store<ActionContext>, prefix = '') {
  return new Proxy({}, {
    get: (target, key) => {
      if (typeof key === 'symbol') return target[key]
      key = prefix + key
      if (key in scope) return toValue(scope[key])
      const _prefix = key + '.'
      if (Object.keys(scope).some(k => k.startsWith(_prefix))) {
        return createScope(scope, key + '.')
      }
    },
  })
}
