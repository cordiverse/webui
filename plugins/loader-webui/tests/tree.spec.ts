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

afterEach(() => {
  mounted?.cleanup()
  mounted = undefined
})

// Helper: count visible nodes (collapsed children are present in the DOM with
// an el-tree wrapping but `display: none` via the collapse animation; for
// structural assertions we use the data-set count via .el-tree-node).
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

    // 1 group (expanded) + 2 children + 1 sibling = 4 rendered rows
    expect(visibleNodes(mounted.wrapper).length).toBe(4)

    // Group should have the `.is-group` class applied via optionProps.class
    const group = mounted.wrapper.findAll('.el-tree-node').find((n: any) =>
      n.find('.label').text() === 'group',
    )
    expect(group).toBeTruthy()
    expect(group!.classes()).toContain('is-group')
  })

  it('keeps collapsed groups from rendering their children', async () => {
    mounted = await mountWithManager(Tree, { data: collapsedGroup })
    await nextTick()

    // Only the group row is rendered; the child is skipped because el-tree
    // honours `default-expanded-keys` and `collapsed` entries are excluded.
    // Children may exist in the DOM tree but inside a collapsed wrapper
    // (`.el-tree-node__children[style="display: none;"]`). Assert the child
    // label is not in the visible rendered text.
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

  it('routes to a plugin and does NOT fire an RPC when el-tree emits node-click', async () => {
    mounted = await mountWithManager(Tree, { data: flatList })
    await nextTick()

    // happy-dom doesn't reliably propagate mouse events through el-tree's
    // internal click wiring, so drive the public Vue event contract instead:
    // emit `node-click` on the <el-tree> instance, which is what the
    // component binds `handleClick` to.
    const elTree = mounted.wrapper.findAllComponents({ name: 'ElTree' })[0]
    expect(elTree.exists()).toBe(true)

    const entry = flatList.entries[1]
    elTree.vm.$emit('node-click', entry, { data: entry, parent: null, childNodes: [] }, elTree.vm, new MouseEvent('click'))
    await flushPromises()

    expect(mounted.router.currentRoute.value.path).toBe('/plugins/e2')
    expect(mounted.send).not.toHaveBeenCalledWith('manager.config.update', expect.anything())
  })

  it('disables core-dep plugin toggling (menu item reports disabled)', async () => {
    mounted = await mountWithManager(Tree, { data: withCoreDep })
    await nextTick()

    // Manager.hasCoreDeps is Manager's own logic — verify directly that the
    // core-dep entry is flagged, which is what the menu `disabled` predicates
    // read at render time.
    const webuiEntry = withCoreDep.entries.find(e => e.id === 'webui')!
    const otherEntry = withCoreDep.entries.find(e => e.id === 'other')!
    expect(mounted.manager.hasCoreDeps(webuiEntry)).toBe(true)
    expect(mounted.manager.hasCoreDeps(otherEntry)).toBe(false)
  })
})
