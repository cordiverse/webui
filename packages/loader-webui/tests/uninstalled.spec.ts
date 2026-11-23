// @vitest-environment happy-dom

import { describe, it, expect, afterEach } from 'vitest'
import { nextTick } from 'vue'

import Index from '../client/components/index.vue'
import { mountWithManager, type MountResult } from './helpers/mount'
import type { Data, EntryData, LocalObject } from '../src'

let mounted: MountResult<any> | undefined

afterEach(async () => {
  await mounted?.cleanup()
  mounted = undefined
})

function entry(input: Partial<EntryData> & { id: string; name: string }): EntryData {
  return { parent: null, position: 0, ...input } as EntryData
}

function pkg(name: string, extra: Partial<LocalObject> = {}): LocalObject {
  return {
    shortname: name.includes('/plugin-') ? name.split('/plugin-')[1] : name,
    package: { name, version: '1.0.0' },
    manifest: {},
    runtime: { inject: {} },
    ...extra,
  } as LocalObject
}

function makeData(entries: EntryData[], packages: Record<string, LocalObject> = {}): Data {
  return { entries, packages, services: {}, prefix: '' }
}

describe('loader-webui overview — uninstalled plugin', () => {
  it('renders the uninstalled fallback comment and the requested package name', async () => {
    const data = makeData([
      entry({ id: 'e1', name: '@scope/unknown-plugin' }),
    ])
    mounted = await mountWithManager(Index, { data, initialRoute: '/plugins/e1' })
    await nextTick()

    const text = mounted.wrapper.text()
    expect(text).toContain('@scope/unknown-plugin')
    expect(text).toContain('此插件尚未安装')
  })

  it('does not show the loading/error placeholders that the installed path uses', async () => {
    const data = makeData([
      entry({ id: 'e1', name: '@scope/unknown-plugin' }),
    ])
    mounted = await mountWithManager(Index, { data, initialRoute: '/plugins/e1' })
    await nextTick()

    const text = mounted.wrapper.text()
    expect(text).not.toContain('正在加载插件信息')
    expect(text).not.toContain('插件信息失败')
  })

  it('still keeps the 概览 tab present (other tabs require runtime, which is absent)', async () => {
    const data = makeData([
      entry({ id: 'e1', name: '@scope/unknown-plugin' }),
    ])
    mounted = await mountWithManager(Index, { data, initialRoute: '/plugins/e1' })
    await nextTick()

    const currentEntry = mounted.manager.currentEntry!
    const tabs = [...mounted.manager.getRoutes(currentEntry)].map((r) => r.label)
    expect(tabs).toEqual(['概览'])
  })

  it('omits the uninstalled comment once the package becomes available', async () => {
    const data = makeData([
      entry({ id: 'e1', name: '@cordisjs/plugin-echo' }),
    ], {
      '@cordisjs/plugin-echo': pkg('@cordisjs/plugin-echo'),
    })
    mounted = await mountWithManager(Index, { data, initialRoute: '/plugins/e1' })
    await nextTick()

    expect(mounted.wrapper.text()).not.toContain('此插件尚未安装')
  })

  it('isolates the uninstalled branch to the affected entry (sibling installed entry behaves normally)', async () => {
    const data = makeData([
      entry({ id: 'ok', name: '@cordisjs/plugin-echo', position: 0 }),
      entry({ id: 'missing', name: '@scope/unknown-plugin', position: 1 }),
    ], {
      '@cordisjs/plugin-echo': pkg('@cordisjs/plugin-echo'),
    })

    mounted = await mountWithManager(Index, { data, initialRoute: '/plugins/missing' })
    await nextTick()
    expect(mounted.wrapper.text()).toContain('此插件尚未安装')
    await mounted.cleanup()

    mounted = await mountWithManager(Index, { data, initialRoute: '/plugins/ok' })
    await nextTick()
    expect(mounted.wrapper.text()).not.toContain('此插件尚未安装')
  })
})
