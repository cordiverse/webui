<template>
  <el-scrollbar class="plugin-tree" ref="root">
    <div class="search">
      <el-input v-model="keyword" #suffix>
        <k-icon name="search"></k-icon>
      </el-input>
    </div>
    <el-tree
      ref="tree"
      node-key="path"
      :data="plugins.data"
      :draggable="true"
      :auto-expand-parent="false"
      :default-expanded-keys="plugins.expanded"
      :expand-on-click-node="false"
      :filter-node-method="filterNode"
      :props="{ class: getClass }"
      :allow-drag="allowDrag"
      :allow-drop="allowDrop"
      @node-click="handleClick"
      @node-contextmenu="trigger"
      @node-drop="handleDrop"
      @node-expand="handleExpand"
      @node-collapse="handleCollapse"
      #="{ node }">
      <div class="item" :ref="handleItemMount">
        <div class="label" :title="getLabel(node)">
          {{ getLabel(node) }}
        </div>
        <div class="right">
          <span v-if="node.data.name" class="status-light" :class="ctx.manager.getStatus(node.data)"></span>
        </div>
      </div>
    </el-tree>
  </el-scrollbar>
</template>

<script lang="ts" setup>

import { computed, ref, onActivated, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { ElScrollbar, ElTree } from 'element-plus'
import { send, useContext, useMenu } from '@cordisjs/client'
import { Node } from '..'

const props = defineProps<{
  modelValue: string
}>()

const ctx = useContext()
const route = useRoute()
const trigger = useMenu('config.tree')
const plugins = computed(() => ctx.manager.plugins.value)

const emit = defineEmits(['update:modelValue'])

const root = ref<InstanceType<typeof ElScrollbar>>()
const tree = ref<InstanceType<typeof ElTree>>()
const keyword = ref('')

function filterNode(value: string, data: Node) {
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

function handleItemMount(itemEl: HTMLElement) {
  if (!itemEl || isActivating.value) return
  activate()
}

interface TreeNode {
  data: Node
  label?: string
  parent: TreeNode
  expanded: boolean
  isLeaf: boolean
  childNodes: TreeNode[]
}

function getLabel(node: TreeNode) {
  if (node.data.name === 'group') {
    return '分组：' + (node.label || node.data.path)
  } else {
    return node.label || node.data.name || '待添加'
  }
}

function allowDrag(node: TreeNode) {
  return node.data.path !== ''
}

function allowDrop(source: TreeNode, target: TreeNode, type: 'inner' | 'prev' | 'next') {
  if (type !== 'inner') {
    return target.data.path !== '' || type === 'next'
  }
  return target.data.id.startsWith('group:')
}

function handleClick(tree: Node, target: TreeNode, instance: any, event: MouseEvent) {
  emit('update:modelValue', tree.path)
  // el-tree will stop propagation,
  // so we need to manually trigger the event
  // so that context menu can be closed.
  window.dispatchEvent(new MouseEvent(event.type, event))
}

function handleExpand(data: Node, target: TreeNode, instance) {
  send('manager.config.update', {
    id: data.path,
    collapse: null,
  })
}

function handleCollapse(data: Node, target: TreeNode, instance) {
  send('manager.config.update', {
    id: data.path,
    collapse: true,
  })
}

function handleDrop(source: TreeNode, target: TreeNode, position: 'before' | 'after' | 'inner', event: DragEvent) {
  const parent = position === 'inner' ? target : target.parent
  let index = parent.childNodes.findIndex(node => node.data.path === source.data.path)
  send('manager.config.teleport', {
    id: source.data.id,
    parent: parent.data.path,
    position: index,
  })
}

function getClass(tree: Node) {
  const words: string[] = []
  if (tree.children) words.push('is-group')
  if (!tree.children && !(tree.name in ctx.manager.data.value.packages)) words.push('is-disabled')
  if (tree.path === props.modelValue) words.push('is-active')
  return words.join(' ')
}

watch(keyword, (val) => {
  tree.value?.filter(val)
})

</script>

<style lang="scss">

.plugin-tree {
  width: 100%;
  height: 100%;
  overflow: auto;

  .el-scrollbar__view {
    padding: 1rem 0;
    line-height: 2.25rem;
  }

  .search {
    padding: 0 1.5rem;
  }

  .k-icon-filter {
    height: 15px;
  }

  .el-tree-node {
    &.is-group > .el-tree-node__content {
      font-weight: bold;
    }
  }

  .el-tree-node__content {
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
      margin: 0 1.5rem 0 0.5rem;
    }
  }
}

</style>
