// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { computed, defineComponent, h, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { kContext, kRoute, kRouter, useContext, useRoute } from '@cordisjs/client'
import { createHarness, Harness } from './harness/index.ts'

async function flush(times = 5) {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

// Minimal stand-in for `app/theme/index.vue`'s state machine — same
// priority order, but renders a stable string we can assert on. Keeping the
// test view in-spec means we can exercise the logic without dragging in
// ActivityBar / StatusBar / icon registry / etc.
const StateView = defineComponent({
  name: 'TestStateView',
  setup() {
    const route = useRoute()
    const ctx = useContext()
    const state = computed(() => {
      if (route.matched[0]?.component) return 'matched'
      const loader = ctx.client.loader
      if (loader.initialStatus === 404 || loader.ready.value) return 'not-found'
      return 'loading'
    })
    return () => h('div', { 'data-state': state.value })
  },
})

function mountStateView(harness: Harness): VueWrapper<any> {
  return mount(StateView, {
    global: {
      provide: {
        [kContext as any]: harness.ctx,
        [kRouter as any]: harness.ctx.client.router.router,
        [kRoute as any]: harness.ctx.client.router.router.currentRoute,
      },
    },
  })
}

// Test-only escape hatch for setting `currentRoute` to an unmatched URL.
// `router.push` / `router.replace` strictly throw on unmatched targets in
// production code, so simulating "user landed on a bad URL" requires a
// direct shallowRef assignment that bypasses validation, history ops, and
// afterEach guards. This mirrors what the popstate / `router.ready()`
// internal callers do via `_navigate`, but condensed.
function gotoUnmatched(harness: Harness, path: string) {
  const r = harness.ctx.client.router.router
  r.currentRoute.value = r.resolve(path)
}

describe('route view state machine', () => {
  let harness: Harness
  let view: VueWrapper<any>

  beforeEach(async () => { harness = await createHarness() })
  afterEach(async () => {
    if (view) view.unmount()
    await harness.cleanup()
  })

  it('matched route → renders the matched component', async () => {
    const Stub = defineComponent({ template: '<div class="stub">stub</div>' })
    harness.ctx.client.router.page({ path: '/foo', name: 'foo', component: Stub })
    await harness.ctx.client.router.router.push('/foo')

    view = mountStateView(harness)
    expect(view.attributes('data-state')).toBe('matched')
  })

  it('module loads (page registered) → addRoute reactively swaps → matched', async () => {
    // Simulate user landing on a route whose entry hasn't loaded yet.
    gotoUnmatched(harness, '/plugins/abc')

    view = mountStateView(harness)
    expect(view.attributes('data-state')).not.toBe('matched')

    // Registering the route reactively re-resolves currentRoute through
    // the addRoute add-time hook — no `redirectTo` machinery needed.
    const Stub = defineComponent({ template: '<div>x</div>' })
    harness.ctx.client.router.page({ path: '/plugins{/*id}', name: 'plugins', component: Stub })
    await nextTick()
    expect(view.attributes('data-state')).toBe('matched')
  })

  it('no entry covers path + ready=false → loading', async () => {
    harness.ctx.client.loader.ready.value = false
    gotoUnmatched(harness, '/totally-unknown')
    view = mountStateView(harness)
    expect(view.attributes('data-state')).toBe('loading')
  })

  it('no entry covers path + ready=true → 404', async () => {
    gotoUnmatched(harness, '/totally-unknown')
    expect(harness.ctx.client.loader.ready.value).toBe(true)
    view = mountStateView(harness)
    expect(view.attributes('data-state')).toBe('not-found')
  })

  it('entry dispose makes URL render 404 without changing url', async () => {
    const Stub = defineComponent({ template: '<div>x</div>' })
    const dispose = harness.ctx.client.router.page({
      path: '/plugins{/*id}', name: 'plugins', component: Stub,
    })
    await harness.ctx.client.router.router.push('/plugins/x')

    view = mountStateView(harness)
    expect(view.attributes('data-state')).toBe('matched')
    const urlBefore = window.location.pathname
    expect(urlBefore).toBe('/plugins/x')

    // Dispose the route. The addRoute teardown re-resolves currentRoute
    // against the now-shrunk record table (matched=[] now); URL stays put
    // because we don't run history operations on internal re-resolves.
    dispose()
    await nextTick()

    expect(view.attributes('data-state')).toBe('not-found')
    expect(window.location.pathname).toBe(urlBefore)
  })

  it('push to unmatched URL throws', async () => {
    expect(() => harness.ctx.client.router.router.push('/typo'))
      .toThrow(/no route matches/)
  })

  it('replace to unmatched URL throws', async () => {
    expect(() => harness.ctx.client.router.router.replace('/typo'))
      .toThrow(/no route matches/)
  })
})

describe('ready signal tracks pending module loads', () => {
  let harness: Harness

  beforeEach(async () => { harness = await createHarness() })
  afterEach(async () => { await harness.cleanup() })

  it('starts true after createHarness completes (initial init done, no pending modules)', async () => {
    expect(harness.ctx.client.loader.ready.value).toBe(true)
  })

  it('addEntry leaves ready true after its module-task settles (files=[])', async () => {
    expect(harness.ctx.client.loader.ready.value).toBe(true)

    // Harness's TestWebUI returns files=[] from getEntryFiles, so the
    // module-task Promise.all resolves on the next microtask. After flushing
    // microtasks the counter has been bumped +1 then -1; ready is balanced
    // back to true.
    harness.ctx.webui.addEntry({ baseUrl: '', manifest: '' } as any, { x: 1 })
    await flush()
    expect(harness.ctx.client.loader.ready.value).toBe(true)
  })

  it('_bumpPending toggles ready in lockstep with the in-flight count', async () => {
    const loader = harness.ctx.client.loader as any
    expect(loader.ready.value).toBe(true)

    // Simulate a runtime entry whose module is genuinely in flight — what
    // would happen if the entry's `files` listed real URLs that take time
    // to import.
    loader._bumpPending(+1)
    expect(loader.ready.value).toBe(false)

    loader._bumpPending(+1)
    expect(loader.ready.value).toBe(false)

    loader._bumpPending(-1)
    expect(loader.ready.value).toBe(false)

    loader._bumpPending(-1)
    expect(loader.ready.value).toBe(true)
  })
})

describe('stuck entry does not block first-paint decisions', () => {
  let harness: Harness
  let view: VueWrapper<any>

  beforeEach(async () => { harness = await createHarness() })
  afterEach(async () => {
    if (view) view.unmount()
    await harness.cleanup()
  })

  it('matched route still renders even when a sibling entry is stuck', async () => {
    // Sibling entry that never finishes importing its module.
    ;(harness.ctx.client.loader as any)._bumpPending(+1)
    expect(harness.ctx.client.loader.ready.value).toBe(false)

    // Unrelated entry that successfully registers a route.
    const Stub = defineComponent({ template: '<div>good</div>' })
    harness.ctx.client.router.page({ path: '/good', name: 'good', component: Stub })
    await harness.ctx.client.router.router.push('/good')

    view = mountStateView(harness)
    expect(view.attributes('data-state')).toBe('matched')
  })

  it('initialStatus=404 short-circuits NotFound even when a sibling entry is stuck', async () => {
    // Pretend the document was served with HTTP 404.
    ;(harness.ctx.client.loader as any).initialStatus = 404
    // Sibling entry stuck in flight — would normally hold ready at false.
    ;(harness.ctx.client.loader as any)._bumpPending(+1)
    expect(harness.ctx.client.loader.ready.value).toBe(false)

    gotoUnmatched(harness, '/unknown')
    view = mountStateView(harness)
    expect(view.attributes('data-state')).toBe('not-found')
  })

  it('without initialStatus a stuck sibling does keep unmatched URLs in loading', async () => {
    // Documents the trade-off: SPA-internal navigation to a bad URL has no
    // fresh status code to consult, so a stuck entry holds the view at
    // loading. Initial document loads avoid this via initialStatus.
    ;(harness.ctx.client.loader as any)._bumpPending(+1)
    expect(harness.ctx.client.loader.initialStatus).toBeUndefined()

    gotoUnmatched(harness, '/unknown')
    view = mountStateView(harness)
    expect(view.attributes('data-state')).toBe('loading')
  })
})

describe('initial 404 fast path', () => {
  let harness: Harness
  let view: VueWrapper<any>

  beforeEach(() => {
    const orig = performance.getEntriesByType.bind(performance)
    vi.spyOn(performance, 'getEntriesByType').mockImplementation((type: string) => {
      if (type === 'navigation') return [{ responseStatus: 404 } as any]
      return orig(type as any) as any
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    if (view) view.unmount()
    if (harness) await harness.cleanup()
  })

  it('captures responseStatus=404 from PerformanceNavigationTiming at construct time', async () => {
    harness = await createHarness()
    expect(harness.ctx.client.loader.initialStatus).toBe(404)
  })

  it('renders 404 immediately for an unmatched URL when initialStatus is 404', async () => {
    harness = await createHarness()
    gotoUnmatched(harness, '/never-registered')

    view = mountStateView(harness)
    expect(view.attributes('data-state')).toBe('not-found')
  })
})
