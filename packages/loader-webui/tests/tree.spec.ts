// @vitest-environment happy-dom

import { describe, it, expect, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

import Tree from '../client/components/tree.vue'
import { mountWithManager, type MountResult } from './helpers/mount'
import {
  emptyData,
  flatList,
  nestedGroup,
  collapsedGroup,
  missingPackage,
  withCoreDep,
} from './fixtures/data'

let mounted: MountResult<any> | undefined

afterEach(async () => {
  await mounted?.cleanup()
  mounted = undefined
})

function visibleNodes(wrapper: any) {
  return wrapper.findAll('.el-tree-node')
}

describe('loader-webui tree rendering', () => {
  it('renders nothing in the tree when there are no entries', async () => {
    mounted = await mountWithManager(Tree, { data: emptyData })
    await nextTick()

    expect(visibleNodes(mounted.wrapper).length).toBe(0)
    expect(mounted.wrapper.find('.el-tree__empty-block').exists()).toBe(true)
  })

  it('renders one .el-tree-node per top-level entry for a flat list', async () => {
    mounted = await mountWithManager(Tree, { data: flatList })
    await nextTick()

    const nodes = visibleNodes(mounted.wrapper)
    expect(nodes.length).toBe(3)

    const labels = nodes.map((n: any) => n.find('.label').text())
    expect(labels).toEqual(['echo', 'server', 'timer'])
  })

  it('marks the currently-routed entry with `is-active`', async () => {
    mounted = await mountWithManager(Tree, {
      data: flatList,
      initialRoute: '/plugins/e2',
    })
    await nextTick()

    const active = mounted.wrapper.findAll('.el-tree-node.is-active')
    expect(active.length).toBe(1)
    expect(active[0].find('.label').text()).toBe('server')
  })

  it('expands groups when `collapse` is not true (renders children in DOM)', async () => {
    mounted = await mountWithManager(Tree, { data: nestedGroup })
    await nextTick()

    expect(visibleNodes(mounted.wrapper).length).toBe(4)

    const group = mounted.wrapper.findAll('.el-tree-node').find((n: any) =>
      n.find('.label').text() === 'group',
    )
    expect(group).toBeTruthy()
    expect(group!.classes()).toContain('is-group')
  })

  it('keeps collapsed groups from rendering their children', async () => {
    mounted = await mountWithManager(Tree, { data: collapsedGroup })
    await nextTick()

    expect(mounted.wrapper.text()).not.toContain('echo')
  })

  it('flags entries whose package is missing with `not-found`', async () => {
    mounted = await mountWithManager(Tree, { data: missingPackage })
    await nextTick()

    const missing = mounted.wrapper.findAll('.el-tree-node').find((n: any) =>
      n.find('.label').text().includes('unknown-plugin'),
    )
    expect(missing).toBeTruthy()
    expect(missing!.classes()).toContain('not-found')
  })

  it('navigates the router when el-tree emits node-click', async () => {
    mounted = await mountWithManager(Tree, { data: flatList })
    await nextTick()

    const elTree = mounted.wrapper.findAllComponents({ name: 'ElTree' })[0]
    expect(elTree.exists()).toBe(true)

    const entry = flatList.entries[1]
    elTree.vm.$emit('node-click', entry, { data: entry, parent: null, childNodes: [] }, elTree.vm, new MouseEvent('click'))
    await flushPromises()

    expect(mounted.router.currentRoute.value.path).toBe('/plugins/e2')
  })

  it('disables core-dep plugin toggling (menu item reports disabled)', async () => {
    mounted = await mountWithManager(Tree, { data: withCoreDep })
    await nextTick()

    const webuiEntry = withCoreDep.entries.find(e => e.id === 'webui')!
    const otherEntry = withCoreDep.entries.find(e => e.id === 'other')!
    expect(mounted.manager.hasCoreDeps(webuiEntry)).toBe(true)
    expect(mounted.manager.hasCoreDeps(otherEntry)).toBe(false)
  })
})
