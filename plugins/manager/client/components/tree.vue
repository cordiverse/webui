<template>
  <el-scrollbar class="plugin-tree" ref="root" @contextmenu.stop="trigger($event)">
    <div class="search px-4 pt-4 top-0 flex gap-x-2 w-full box-border absolute z-100">
      <el-input v-model="keyword" #prefix>
        <k-icon name="search"></k-icon>
      </el-input>
      <el-button class="p-0 h-8 w-8 shrink-0" @click.stop="trigger($event)">
        <k-icon name="add"></k-icon>
      </el-button>
    </div>
    <el-tree
      ref="tree"
      node-key="id"
      :data="plugins.data"
      :draggable="true"
      :default-expanded-keys="plugins.expanded"
      :expand-on-click-node="false"
      :filter-node-method="filterNode"
      :props="optionProps"
      :allow-drag="allowDrag"
      :allow-drop="allowDrop"
      @node-click="handleClick"
      @node-contextmenu="trigger"
      @node-drop="handleDrop"
      @node-expand="handleExpand"
      @node-collapse="handleCollapse"
      #="{ node }">
      <div class="item" :ref="handleItemMount">
        <div class="label">
          {{ ctx.manager.getLabel(node.data) }}
        </div>
        <div class="right">
          <span class="status-light" :class="getStatusClass(node.data)"></span>
        </div>
      </div>
    </el-tree>
  </el-scrollbar>
</template>

<script lang="ts" setup>

import { computed, ref, onActivated, nextTick, watch, VNodeRef } from 'vue'
import { useRoute } from 'vue-router'
import type { ElScrollbar, ElTree } from 'element-plus'
import type { FilterNodeMethodFunction, TreeOptionProps } from 'element-plus/es/components/tree/src/tree.type'
import type TreeNode from 'element-plus/es/components/tree/src/model/node'
import { send, router, useContext, useMenu, deepEqual } from '@cordisjs/client'
import { getStatusClass } from '../utils'
import { EntryData } from '../../src'

const ctx = useContext()
const route = useRoute()
const trigger = useMenu('config.tree')
const plugins = computed(() => ctx.manager.plugins.value)

const root = ref<InstanceType<typeof ElScrollbar>>()
const tree = ref<InstanceType<typeof ElTree>>()
const keyword = ref('')

const filterNode: FilterNodeMethodFunction = (value, data, node) => {
  console.log('filter', value, data, node)
  return data.name.toLowerCase().includes(keyword.value.toLowerCase())
}

const isActivating = ref(true)

// This will be called in 3 situations:
// 1. the component is activated
// 2. a new config entry is added
// 3. route is programmatically changed
async function activate() {
  await nextTick()
  const rootEl = root.value?.$el
  const nodeEl = rootEl?.querySelector('.el-tree-node.is-active') as HTMLElement
  if (!nodeEl || !nodeEl.offsetTop && route.path.slice(9 /* /plugins/ */)) return
  root.value!['setScrollTop'](nodeEl.offsetTop - (rootEl.offsetHeight - nodeEl.offsetHeight) / 2)
}

defineExpose({ activate })

onActivated(async () => {
  activate()
  isActivating.value = false
})

const handleItemMount: VNodeRef = (itemEl) => {
  if (!itemEl || isActivating.value) return
  activate()
}

interface EntryNode extends Omit<TreeNode, 'data'> {
  data: EntryData
  parent: EntryNode
  childNodes: EntryNode[]
}

function allowDrag(node: EntryNode) {
  return !!node.data.id
}

function allowDrop(source: EntryNode, target: EntryNode, type: 'inner' | 'prev' | 'next') {
  if (type !== 'inner') return true
  return target.data.isGroup
}

function handleClick(tree: EntryData, target: EntryNode, instance: any, event: MouseEvent) {
  router.replace('/plugins/' + tree.id)
  // el-tree will stop propagation,
  // so we need to manually trigger the event
  // so that context menu can be closed.
  window.dispatchEvent(new MouseEvent(event.type, event))
}

function handleExpand(data: EntryData, target: EntryNode, instance: any) {
  send('manager.config.update', {
    id: data.id,
    collapse: null,
  })
}

function handleCollapse(data: EntryData, target: EntryNode, instance: any) {
  send('manager.config.update', {
    id: data.id,
    collapse: true,
  })
}

function handleDrop(source: EntryNode, target: EntryNode, position: 'before' | 'after' | 'inner', event: DragEvent) {
  const parent = position === 'inner' ? target : target.parent
  const index = parent.childNodes.findIndex(node => node.data.id === source.data.id)
  send('manager.config.update', {
    id: source.data.id,
    parent: parent.parent ? parent.data.id : null,
    position: index,
  })
}

const optionProps: TreeOptionProps = {
  class(tree: any, node) {
    const entry = tree as EntryData
    const words: string[] = []
    if (entry.isGroup) words.push('is-group')
    if (!entry.isGroup && !(entry.name in ctx.manager.data.value.packages)) words.push('not-found')
    if (entry.id === ctx.manager.currentEntry?.id) words.push('is-active')
    const change = ctx.manager.changes[entry.id]
    if (change && !deepEqual(change.config, entry.config)) {
      words.push('is-edited')
    }
    return words.join(' ')
  },
}

watch(keyword, (val) => {
  tree.value?.filter(val)
})

</script>

<style lang="scss" scoped>

.search {
  background: var(--k-side-bg);
}

.search::after {
  position: absolute;
  content: '';
  top: 100%;
  left: 0;
  width: 100%;
  height: 32px;
  background: linear-gradient(var(--k-side-bg) 25%, transparent 50%);
}

.el-scrollbar {
  :deep(.el-scrollbar__view) {
    padding: 4rem 0 1rem;
    line-height: 2.25rem;
  }

  :deep(.el-tree-node) {
    &.is-edited > .el-tree-node__content {
      color: var(--warning);
    }

    &.is-group > .el-tree-node__content {
      font-weight: bold;
    }

    &.not-found > .el-tree-node__content .status-light {
      display: none;
    }
  }

  :deep(.el-tree-node__content) {
    .item {
      flex: 1;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      overflow: hidden;
    }

    .label {
      overflow: hidden;
      text-overflow: ellipsis;
      transition: var(--color-transition);
    }

    .right {
      height: 100%;
      width: 1rem;
      margin: 0 1.5rem 0 0.5rem;
      text-align: center;
    }
  }
}

</style>
