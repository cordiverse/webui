import { Context, Fiber, Service } from 'cordis'
import type {} from '@cordisjs/plugin-loader'
import type { ClientEvents } from '@cordisjs/plugin-webui'
import { inject, InjectionKey, markRaw, onScopeDispose, Ref, ref } from 'vue'

declare module 'cordis' {
  interface Events extends ClientEvents {}
}

export const kContext = Symbol('context') as InjectionKey<Context>

export function useContext() {
  const parent = inject(kContext)!
  const fiber = parent.plugin(() => {})
  onScopeDispose(fiber.dispose)
  return fiber.ctx as Context
}

export function useInject<K extends string & keyof Context>(name: K): Ref<Context[K]> {
  const parent = inject(kContext)!
  const service = ref<any>(parent.get(name))
  onScopeDispose(parent.on('internal/service', () => {
    service.value = parent.get(name)
  }))
  return service
}

export function useRpc<T>(): Ref<T> {
  const parent = inject(kContext)!
  return parent.$entry!.data
}

markRaw(Context.prototype)
markRaw(Fiber.prototype)
markRaw(Service.prototype)
