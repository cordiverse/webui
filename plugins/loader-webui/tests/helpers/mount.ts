// Mount helper for loader-webui client component tests.
//
// Responsibilities:
// 1. Build a fresh cordis `Context` per call (isolates service registrations).
// 2. Attach a fake `ctx.client` exposing the sub-services Manager reads from
//    (router / action / wrapComponent). Provides spy-able `page`, `slot`,
//    `menu`, `action`.
// 3. Create a memory-backed test router and wire it into both
//    `ctx.client.router.router` (so `manager.currentEntry` / `currentRoute`
//    read the same router the component's `useRoute` / `useRouter` sees) and
//    into `global.provide` of `@vue/test-utils` (via the shim's kRoute / kRouter
//    symbols).
// 4. Instantiate Manager on the context with the given `Data` ref.
// 5. Provide the test context via `kContext` (from the shim) so `useContext`
//    inside SFCs picks it up.

import { mount, type ComponentMountingOptions, type VueWrapper } from '@vue/test-utils'
import { ref, type Component, type Ref } from 'vue'
import { Context } from 'cordis'
import { vi, type Mock } from 'vitest'

import {
  createTestRouter, kContext, kRoute, kRouter, send, type TestRouter,
} from '../../../../tests/shims/cordisjs-client'
import Manager from '../../client/index'
import type { Data } from '../../src'

export interface MountOptions {
  data: Data
  /** Preload RPC handlers that `send` should dispatch to. */
  listeners?: Record<string, (...args: any[]) => any>
  /** Initial router location (e.g. `/plugins/e1/config`). Defaults to `/`. */
  initialRoute?: string
  /** Extra props forwarded to the mounted component. */
  props?: Record<string, any>
}

export interface MountResult<C> {
  wrapper: VueWrapper<any>
  ctx: Context & { manager: Manager }
  manager: Manager
  data: Ref<Data>
  router: TestRouter
  send: Mock
  /** Spy record for `ctx.client.router.*` and `ctx.client.action.*` calls. */
  clientSpies: {
    page: Mock
    slot: Mock
    menu: Mock
    action: Mock
  }
  /** Cleanup — call in `afterEach` for deterministic test isolation. */
  cleanup: () => void
}

export async function mountWithManager<C extends Component>(
  component: C,
  options: MountOptions,
): Promise<MountResult<C>> {
  const { data, listeners = {}, initialRoute = '/', props = {} } = options
  const dataRef = ref(data) as Ref<Data>

  const router = createTestRouter(initialRoute)

  const page = vi.fn()
  const slot = vi.fn()
  const menu = vi.fn()
  const action = vi.fn()

  const ctx = new Context() as any
  ctx.client = {
    app: null,
    router: { router, page, slot },
    action: { menu, action },
    wrapComponent: (c: any) => c,
    loader: { entries: {} },
    setting: { settings: vi.fn() },
    theme: { register: vi.fn() },
  }
  ctx.$entry = { data: dataRef, done: ref(true), state: {}, fibers: {} }

  // Reset the shared `send` spy for this test and install RPC handlers.
  send.mockReset()
  send.mockImplementation(async (type: string, ...args: any[]) => {
    const handler = listeners[type]
    return handler ? await handler(...args) : undefined
  })

  // Construct Manager. `super(ctx, 'manager')` registers it on the context so
  // `ctx.manager` becomes the instance, which tree.vue etc. reach through.
  const manager = new Manager(ctx, dataRef)

  const wrapper = mount(component, {
    props,
    global: {
      provide: {
        [kContext]: ctx,
        [kRouter]: router,
        [kRoute]: router.currentRoute,
      },
    },
  } as ComponentMountingOptions<C>)

  return {
    wrapper,
    ctx,
    manager,
    data: dataRef,
    router,
    send,
    clientSpies: { page, slot, menu, action },
    cleanup: () => {
      wrapper.unmount()
      send.mockReset()
    },
  }
}
