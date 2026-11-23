import { Context, Fiber, Service } from 'cordis'
import type {} from '@cordisjs/loader'
import type * as shared from '@cordisjs/webui/shared'
import { inject, InjectionKey, markRaw, onScopeDispose, Ref, ref } from 'vue'

declare module 'cordis' {
  interface Events extends shared.Events {}
}

export const kContext = Symbol('context') as InjectionKey<Context>

export function useContext() {
  const parent = inject(kContext)!
  const fiber = parent.use(() => {})
  onScopeDispose(fiber.dispose)
  return fiber.ctx as Context
}

export function useInject<K extends string & keyof Context>(name: K): Ref<Context[K]> {
  const parent = inject(kContext)!
  const initial = parent.get(name)
  const service = ref<any>(typeof initial === 'object' && initial ? markRaw(initial) : initial)
  onScopeDispose(parent.on('internal/service', () => {
    const value = parent.get(name)
    service.value = typeof value === 'object' && value ? markRaw(value) : value
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
