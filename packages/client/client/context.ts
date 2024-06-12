import * as cordis from 'cordis'
import {
  App, Component, createApp, DefineComponent, defineComponent, h, inject, InjectionKey,
  markRaw, onBeforeUnmount, onErrorCaptured, provide, Ref, resolveComponent,
} from 'vue'
import ActionService from './plugins/action'
import I18nService from './plugins/i18n'
import LoaderService from './plugins/loader'
import RouterService from './plugins/router'
import SettingService from './plugins/setting'
import ThemeService from './plugins/theme'

// layout api

export interface Events<C extends Context = Context> extends cordis.Events<C> {}

export interface Context {
  [Context.events]: Events<this>
  internal: Internal
}

const kContext = Symbol('context') as InjectionKey<Context>

export function useContext() {
  const parent = inject(kContext)!
  const fork = parent.plugin(() => {})
  onBeforeUnmount(() => fork.dispose())
  return fork.ctx
}

export function useRpc<T>(): Ref<T> {
  const parent = inject(kContext)!
  return parent.$entry.data
}

export interface Internal {}

export class Context extends cordis.Context {
  app: App

  constructor() {
    super()
    this.internal = {} as Internal
    this.app = createApp(defineComponent({
      setup: () => () => [
        h(resolveComponent('k-slot'), { name: 'root', single: true }),
        h(resolveComponent('k-slot'), { name: 'global' }),
      ],
    }))
    this.app.provide(kContext, this)

    this.plugin(ActionService)
    this.plugin(I18nService)
    this.plugin(LoaderService)
    this.plugin(RouterService)
    this.plugin(SettingService)
    this.plugin(ThemeService)

    this.on('ready', async () => {
      await this.$loader.initTask
      this.app.use(this.$i18n.i18n)
      this.app.use(this.$router.router)
      this.app.mount('#app')
    })
  }

  addEventListener<K extends keyof WindowEventMap>(
    type: K,
    listener: (this: Window, ev: WindowEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ) {
    return this.effect(() => {
      window.addEventListener(type, listener, options)
      return () => window.removeEventListener(type, listener, options)
    })
  }

  wrapComponent(component: Component): DefineComponent
  wrapComponent(component?: Component): DefineComponent | undefined
  wrapComponent(component: Component) {
    if (!component) return undefined
    if (!this.$entry) return component
    return markRaw(defineComponent((props, { slots }) => {
      provide(kContext, this)
      onErrorCaptured((e, instance, info) => {
        return this.scope.uid !== null
      })
      return () => h(component, props, slots)
    }))
  }
}

markRaw(cordis.Context.prototype)
markRaw(cordis.EffectScope.prototype)
