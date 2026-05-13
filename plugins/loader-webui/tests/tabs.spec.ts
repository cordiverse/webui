// @vitest-environment happy-dom

import { describe, it, expect, afterEach } from 'vitest'
import { Schema } from '@cordisjs/client'

import Tree from '../client/components/tree.vue'
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

function makeData(local: Partial<LocalObject>, entryPatch: Partial<EntryData> = {}): Data {
  return {
    entries: [entry({ id: 'e1', name: '@cordisjs/plugin-foo', ...entryPatch })],
    packages: {
      '@cordisjs/plugin-foo': pkg('@cordisjs/plugin-foo', local),
    },
    services: {},
    prefix: '',
  }
}

async function getTabs(data: Data) {
  mounted = await mountWithManager(Tree, { data })
  return [...mounted.manager.getRoutes(data.entries[0])].map((r) => r.label)
}

describe('loader-webui plugin tabs', () => {
  it('shows 概览 + 服务 by default (runtime present, no readme/schema/inject)', async () => {
    const tabs = await getTabs(makeData({ runtime: { inject: {} } }))
    expect(tabs).toEqual(['概览', '服务'])
  })

  it('hides 服务 when the package has no runtime', async () => {
    const tabs = await getTabs(makeData({ runtime: undefined }))
    expect(tabs).toEqual(['概览'])
  })

  it('shows 介绍 when readme has at least one locale entry', async () => {
    const tabs = await getTabs(makeData({
      runtime: { inject: {} },
      readme: { 'zh-CN': '# Hello' },
    }))
    expect(tabs).toEqual(['概览', '介绍', '服务'])
  })

  it('hides 介绍 when readme is an empty dict', async () => {
    const tabs = await getTabs(makeData({
      runtime: { inject: {} },
      readme: {},
    }))
    expect(tabs).toEqual(['概览', '服务'])
  })

  it('shows 配置 when schema has at least one field', async () => {
    const tabs = await getTabs(makeData({
      runtime: {
        inject: {},
        schema: Schema.object({ host: Schema.string() }),
      },
    }))
    expect(tabs).toEqual(['概览', '配置', '服务'])
  })

  it('hides 配置 when schema is an empty object', async () => {
    const tabs = await getTabs(makeData({
      runtime: {
        inject: {},
        schema: Schema.object({}),
      },
    }))
    expect(tabs).toEqual(['概览', '服务'])
  })

  it('combines 介绍 and 配置 with the default tabs in declared order', async () => {
    const tabs = await getTabs(makeData({
      runtime: {
        inject: {},
        schema: Schema.object({ host: Schema.string() }),
      },
      readme: { 'zh-CN': '# Hello' },
    }))
    expect(tabs).toEqual(['概览', '介绍', '配置', '服务'])
  })

  it('emits one service sub-tab per injected service, capitalised and alphabetically sorted', async () => {
    const tabs = await getTabs(makeData({
      runtime: { inject: { server: true, database: true, http: true } },
    }))
    expect(tabs).toEqual(['概览', '服务', 'Database', 'Http', 'Server'])
  })

  it('merges runtime.inject with entry.inject for service sub-tabs and dedupes', async () => {
    const tabs = await getTabs(makeData(
      { runtime: { inject: { http: true } } },
      { inject: { database: true, http: true } as any },
    ))
    expect(tabs).toEqual(['概览', '服务', 'Database', 'Http'])
  })

  it('hides every service tab (including 服务) when runtime is missing, regardless of inject', async () => {
    const tabs = await getTabs(makeData(
      { runtime: undefined },
      { inject: { database: true } as any },
    ))
    expect(tabs).toEqual(['概览'])
  })
})
