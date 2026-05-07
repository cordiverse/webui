// Replacement for the `@cordisjs/client` module used only under vitest (wired
// via `resolve.alias` in `vitest.config.ts`). Lets component SFCs and `Manager`
// be imported without triggering the real ClientService bootstrap (Vue app +
// vue-router + #app mount).
//
// Re-exports the shared primitives from their real sources so `Manager extends
// Service` and `new Schema(...)` keep working. Replaces the browser-only
// helpers (send / useContext / useMenu / …) with test-controllable stubs.

import { inject, ref, type InjectionKey, type Ref } from 'vue'
import { vi } from 'vitest'
import type { Context } from 'cordis'

export * from 'cordis'
export * from 'cosmokit'
export { default as Schema } from 'schemastery'
export { default as z } from 'schemastery'

// Unique across the test process; mount helpers must use THIS symbol when
// providing the ctx. Re-exported so tests can bypass useContext if they need to.
export const kContext = Symbol('cordis.test.client') as InjectionKey<Context>

// Every test can inspect / stub this. Default impl resolves undefined so
// components that fire-and-forget don't hang.
export const send = vi.fn(async (..._args: any[]) => undefined)

export function useContext(): Context {
  const ctx = inject(kContext)
  if (!ctx) throw new Error('useContext() called without a provided kContext (did you forget mountWithCtx?)')
  return ctx
}

export function useInject<K extends string>(name: K): Ref<any> {
  const ctx = inject(kContext) as any
  return ref(ctx?.[name] ?? ctx?.get?.(name))
}

export function useRpc<T = any>(): Ref<T> {
  const ctx = inject(kContext) as any
  return ctx?.$entry?.data
}

// The real useMenu wires DOM listeners to open a context menu. In tests we
// expose a spy so specs can assert right-click opened the menu.
export function useMenu(type: string) {
  const fn = vi.fn((_event?: Event) => {})
  ;(fn as any).menuType = type
  return fn
}

export function useConfig<T = any>(): Ref<T> {
  return ref({} as T)
}

export const message = {
  success: vi.fn((..._args: any[]) => {}),
  error: vi.fn((..._args: any[]) => {}),
  warning: vi.fn((..._args: any[]) => {}),
  info: vi.fn((..._args: any[]) => {}),
}

export const icons = {
  register: vi.fn(),
  get: vi.fn(),
}

export const locale = ref('zh-CN')
export const socket = ref<any>(undefined)

export default function install() {}
