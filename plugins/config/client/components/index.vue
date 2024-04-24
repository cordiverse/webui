<template>
  <k-layout menu="config.tree" :menu-data="current">
    <template #header>
      <!-- root -->
      <template v-if="!current">插件配置</template>

      <!-- group -->
      <template v-else-if="current.children">
        分组：{{ current.label || current.id }}
      </template>

      <!-- plugin -->
      <template v-else>
        {{ current.label || current.name }} [{{ current.path }}]
      </template>
    </template>

    <template #left>
      <tree-view ref="tree" v-model="path"></tree-view>
    </template>

    <k-empty v-if="!current">
      <div>请在左侧选择插件</div>
    </k-empty>
    <k-content v-else class="plugin-view" :key="path">
      <group-settings v-if="current.children" v-model="config" :current="current"></group-settings>
      <plugin-settings v-else :current="current" v-model="config"></plugin-settings>
    </k-content>

    <el-dialog
      v-model="showRemove"
      title="确认移除"
      destroy-on-close
      @closed="remove = null"
    >
      <template v-if="remove">
        确定要移除{{ remove.children ? `分组 ${remove.label || remove.path}` : `插件 ${remove.label || remove.name}` }} 吗？此操作不可撤销！
      </template>
      <template #footer>
        <el-button @click="showRemove = false">取消</el-button>
        <el-button type="danger" @click="(showRemove = false, removeItem(remove), tree?.activate())">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showRename"
      title="重命名"
      destroy-on-close
      @open="handleOpen"
      @closed="rename = null"
    >
      <template v-if="rename">
        <el-input ref="inputEl" v-model="input" @keydown.enter.stop.prevent="renameItem(rename, input)"/>
      </template>
      <template #footer>
        <el-button @click="showRename = false">取消</el-button>
        <el-button type="primary" @click="renameItem(rename, input)">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      :model-value="groupCreate !== null"
      @update:model-value="groupCreate = null"
      title="创建分组"
      destroy-on-close
      @open="handleOpen"
    >
      <el-input ref="inputEl" v-model="input" @keydown.enter.stop.prevent="createGroup(input)"/>
      <template #footer>
        <el-button @click="groupCreate = null">取消</el-button>
        <el-button type="primary" @click="createGroup(input)">确定</el-button>
      </template>
    </el-dialog>
  </k-layout>
</template>

<script setup lang="ts">

import { computed, ref, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { clone, message, send, store, useContext, Schema } from '@cordisjs/client'
import { Tree, hasCoreDeps, current, plugins, removeItem, dialogSelect, dialogFork } from './utils'
import GroupSettings from './group.vue'
import TreeView from './tree.vue'
import PluginSettings from './plugin.vue'

const route = useRoute()
const router = useRouter()

const path = computed<string>({
  get() {
    const name = route.path.slice(9)
    return name in plugins.value.paths ? name : ''
  },
  set(name) {
    if (!(name in plugins.value.paths)) name = ''
    router.replace('/plugins/' + name)
  },
})

const config = ref()
const input = ref('')
const inputEl = ref()
const tree = ref<InstanceType<typeof TreeView>>()

async function handleOpen() {
  // https://github.com/element-plus/element-plus/issues/15250
  await nextTick()
  inputEl.value?.focus()
}

const remove = ref<Tree>()
const showRemove = ref(false)
const rename = ref<Tree>()
const showRename = ref(false)
const groupCreate = ref<string>(null)

watch(remove, (value) => {
  if (value) showRemove.value = true
})

watch(rename, (value) => {
  if (value) showRename.value = true
})

watch(() => plugins.value.paths[path.value], (value) => {
  current.value = value
  if (value) config.value = clone(value.config)
}, { immediate: true })

const ctx = useContext()

ctx.define('config.tree', current)

ctx.action('config.tree.add-plugin', {
  hidden: ({ config }) => config.tree && !config.tree.children,
  action: ({ config }) => dialogSelect.value = config.tree,
})

ctx.action('config.tree.add-group', {
  hidden: ({ config }) => config.tree && !config.tree.children,
  action: ({ config }) => {
    groupCreate.value = config.tree.path
  },
})

async function createGroup(label: string) {
  const id = await send('manager/add', { name: 'cordis/group', label }, groupCreate.value)
  router.replace('/plugins/' + id)
  groupCreate.value = null
}

ctx.action('config.tree.clone', {
  hidden: ({ config }) => !config.tree || !!config.tree.children,
  action: async ({ config }) => {
    const children = config.tree.parent.path
      ? config.tree.parent.children
      : plugins.value.data.slice(1)
    const index = children.findIndex(tree => tree.path === config.tree.path)
    const id = await send('manager/add', {
      name: config.tree.name,
      config: config.tree.config,
      disabled: true,
    }, config.tree.parent.id, index + 1)
    router.replace(`/plugins/${id}`)
  },
})

ctx.action('config.tree.manage', {
  hidden: ({ config }) => !config.tree || !!config.tree.children,
  action: async ({ config }) => {
    dialogFork.value = config.tree.name
  },
})

ctx.action('config.tree.rename', {
  disabled: ({ config }) => !config.tree,
  action: ({ config }) => {
    input.value = config.tree.label || (config.tree.name === 'group' ? config.tree.path : config.tree.name)
    rename.value = config.tree
  },
})

ctx.action('config.tree.remove', {
  disabled: ({ config }) => !config.tree || hasCoreDeps(config.tree),
  action: ({ config }) => remove.value = config.tree,
})

function checkConfig(name: string) {
  let schema = store.packages[name]?.runtime.schema
  if (!schema) return true
  try {
    (new Schema(schema))(config.value)
    return true
  } catch {
    message.error('当前配置项不满足约束，请检查配置！')
    return false
  }
}

ctx.action('config.tree.save', {
  shortcut: 'ctrl+s',
  disabled: (scope) => !scope?.config?.tree || !['config'].includes(router.currentRoute.value?.meta?.activity.id),
  action: async ({ config: { tree } }) => {
    const { disabled } = tree
    if (!disabled && !checkConfig(tree.name)) return
    try {
      await execute(tree, disabled ? 'unload' : 'reload')
      message.success(disabled ? '配置已保存。' : '配置已重载。')
    } catch (error) {
      message.error('操作失败，请检查日志！')
    }
  },
})

ctx.action('config.tree.toggle', {
  disabled: ({ config }) => !config.tree || hasCoreDeps(config.tree),
  action: async ({ config: { tree } }) => {
    const { disabled, name } = tree
    if (disabled && !checkConfig(tree.name)) return
    try {
      await execute(tree, disabled ? 'reload' : 'unload')
      message.success((name === 'group' ? '分组' : '插件') + (disabled ? '已启用。' : '已停用。'))
    } catch (error) {
      message.error('操作失败，请检查日志！')
    }
  },
})

async function execute(tree: Tree, event: 'unload' | 'reload') {
  await send(`manager/${event}`, tree.id, config.value)
}

function renameItem(tree: Tree, name: string) {
  showRename.value = false
  tree.label = name
  send('manager/meta', tree.path, { $label: name || null })
}

</script>

<style lang="scss">

.end {
  margin-right: 0.5rem;
}

.config-header {
  font-size: 1.375rem;
  margin: 0 0 2rem;
  line-height: 2rem;

  .k-button {
    float: right;
  }
}

.plugin-view .k-content > *:first-child {
  margin-top: 0;
}

</style>
