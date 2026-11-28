// @vitest-environment happy-dom

import { flushPromises, shallowMount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import Tab from '../client/tab.vue'
import { emptyTabState } from '../client/types.ts'

vi.mock('@cordisjs/client', () => ({
  useRpc: () => ({ value: { proxyBaseUrl: 'https://console.example/proxy' } }),
}))

it('sends explicit upstream credentials separately from the browser credentials', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null))
  vi.stubGlobal('fetch', fetch)
  const state = emptyTabState()
  state.url = 'https://api.example/items'
  state.headers = [
    { key: 'Authorization', value: 'Bearer api', enabled: true },
    { key: 'COOKIE', value: 'api=1', enabled: true },
    { key: 'X-Extra', value: 'kept', enabled: true },
  ]
  const tab = shallowMount(Tab, { props: { state, saveTooltip: '' } })
  try {
    await tab.get('button.btn-primary').trigger('click')
    await flushPromises()
    const headers = new Headers(fetch.mock.calls[0][1]?.headers)
    expect(headers.get('upstream-authorization')).toBe('Bearer api')
    expect(headers.get('upstream-cookie')).toBe('api=1')
    expect(headers.get('x-extra')).toBe('kept')
    expect(headers.has('authorization')).toBe(false)
    expect(headers.has('cookie')).toBe(false)
  } finally {
    tab.unmount()
    vi.unstubAllGlobals()
  }
})
