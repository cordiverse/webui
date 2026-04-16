import { Context, Service } from 'cordis'
import {
  App, Component, createApp, customRef, defineComponent, DefineComponent, h, markRaw,
  onErrorCaptured, provide, Ref, resolveComponent,
} from 'vue'
import ActionService from './plugins/action'
import I18nService from './plugins/i18n'
import LoaderService from './plugins/loader'
import RouterService from './plugins/router'
import SettingService from './plugins/setting'
import ThemeService from './plugins/theme'
import { kContext } from './context'
import type { LoadState } from './plugins/loader'
import install from './components'

declare module '@cordisjs/plugin-webui' {
  export interface ClientConfig {
    unsupported?: string[]
  }
}

declare module 'cordis' {
  interface Context {
    client: ClientService
  }
}

export class ClientService extends Service {
  public app: App

  public action: ActionService
  public i18n: I18nService
  public loader: LoaderService
  public router: RouterService
  public setting: SettingService
  public theme: ThemeService

  private _store: Record<string | symbol, Ref<any>> = Object.create(null)

  constructor(ctx: Context) {
    super(ctx, 'client')

    // Initialize root-level properties for client
    ctx.root['$entry'] = undefined as LoadState | undefined

    // Create Vue app
    this.app = createApp(defineComponent({
      setup: () => () => [
        h(resolveComponent('k-slot'), { name: 'root', single: true }),
        h(resolveComponent('k-slot'), { name: 'global' }),
      ],
    }))
    this.app.provide(kContext, ctx as Context)
    this.app.use(install)

    // Create sub-services (they register their own mixins for backward compat)
    this.action = new ActionService(ctx)
    this.i18n = new I18nService(ctx)
    this.loader = new LoaderService(ctx)
    this.router = new RouterService(ctx)
    this.setting = new SettingService(ctx)
    this.theme = new ThemeService(ctx)

    // Vue reactivity tracking for services
    const store = this._store
    ctx.on('internal/service', function (this: Context, name: string) {
      const ref1 = store[(this as any)[Context.isolate][name]]
      if (ref1) ref1.value = Symbol(name)
      const ref2 = store[name]
      if (ref2) ref2.value = Symbol(name)
    }, { global: true })

    ctx.on('internal/get', (ctx, name, error, next) => {
      const ref = store[ctx.reflect.store[name] ?? name] ??= customRef((get, set) => ({ get, set }))
      return ref.value, next()
    }, { prepend: true })

    this.loader.initTask.then(() => {
      this.app.use(this.i18n.i18n)
      this.app.use(this.router.router)
      this.app.mount('#app')
    })
  }

  addEventListener<K extends keyof WindowEventMap>(
    type: K,
    listener: (this: Window, ev: WindowEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ) {
    return this.ctx.effect(() => {
      window.addEventListener(type, listener, options)
      return () => window.removeEventListener(type, listener, options)
    })
  }

  wrapComponent(component: Component): DefineComponent
  wrapComponent(component?: Component): DefineComponent | undefined
  wrapComponent(component: Component) {
    if (!component) return undefined
    if (!this.ctx.$entry) return component
    return markRaw(defineComponent((props, { slots }) => {
      provide(kContext, this.ctx as Context)
      onErrorCaptured(() => {
        return this.ctx.fiber.uid !== null
      })
      return () => h(component, props, slots)
    }))
  }
}

export * from './plugins/action'
export * from './plugins/i18n'
export * from './plugins/loader'
export * from './plugins/router'
export * from './plugins/setting'
export * from './plugins/theme'
export * from './components'
export * from './context'
export * from './data'

export default install

export * from 'cordis'

export interface ActionContext {}

export interface Config {
  locale?: string
}

export const root = new Context()

root.client = new ClientService(root)

root.on('activity', data => !data)
