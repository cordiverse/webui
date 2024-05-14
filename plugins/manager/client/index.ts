import { Context, Dict, router, ScopeStatus, send, Service } from '@cordisjs/client'
import { computed, defineComponent, h, Ref, ref, resolveComponent } from 'vue'
import type { Entry } from '@cordisjs/loader'
import Settings from './components/index.vue'
import Forks from './components/forks.vue'
import Select from './components/select.vue'
import type { Data } from '../src'

import './index.scss'
import './icons'

declare module '@cordisjs/client' {
  interface Context {
    manager: Manager
  }

  interface ActionContext {
    'config.tree': Node
  }
}

export const coreDeps = [
  '@cordisjs/plugin-webui',
  '@cordisjs/plugin-manager',
  '@cordisjs/plugin-server',
]

export interface Node {
  id: string
  name: string
  path: string
  label?: string
  config?: any
  parent?: Node
  disabled?: boolean
  children?: Node[]
}

interface DepInfo {
  required: boolean
}

interface PeerInfo {
  required: boolean
  active: boolean
}

export interface EnvInfo {
  impl: string[]
  using: Dict<DepInfo>
  peer: Dict<PeerInfo>
  warning?: boolean
}

export default class Manager extends Service {
  static inject = {
    optional: ['manager'],
  }

  current = ref<Node>()
  dialogFork = ref<string>()
  dialogSelect = ref<Node>()

  plugins = computed(() => {
    const expanded: string[] = []
    const forks: Dict<string[]> = {}
    const paths: Dict<Node> = {}
    const handle = (config: Entry.Options[]) => {
      return config.map(options => {
        const node: Node = {
          id: options.id,
          name: options.name,
          path: options.id,
          config: options.config,
        }
        if (options.name === 'cordis/group') {
          node.children = handle(options.config)
        }
        if (!options.collapse && node.children) {
          expanded.push(node.path)
        }
        forks[node.name] ||= []
        forks[node.name].push(node.path)
        paths[node.path] = node
        return node
      })
    }
    const data = handle(this.data.value.config)
    return { data, forks, paths, expanded }
  })

  type = computed(() => {
    const env = this.getEnvInfo(this.current.value?.name)
    if (!env) return
    if (env.warning && this.current.value!.disabled) return 'warning'
    for (const name in env.using) {
      if (name in this.data.value.services || {}) {
        if (env.impl.includes(name)) return 'warning'
      } else {
        if (env.using[name].required) return 'warning'
      }
    }
  })

  constructor(ctx: Context) {
    super(ctx, 'manager', true)
  }

  start() {
    this.ctx.slot({
      type: 'global',
      component: defineComponent(() => () => {
        return h(resolveComponent('k-slot'), { name: 'plugin-select', single: true })
      }),
    })

    this.ctx.slot({
      type: 'plugin-select-base',
      component: Select,
      order: -1000,
    })

    this.ctx.slot({
      type: 'plugin-select',
      component: Select,
      order: -1000,
    })

    this.ctx.slot({
      type: 'global',
      component: Forks,
    })

    this.ctx.page({
      id: 'config',
      path: '/plugins/:name*',
      name: '插件配置',
      icon: 'activity:plugin',
      order: 800,
      authority: 4,
      component: Settings,
    })

    this.ctx.menu('config.tree', [{
      id: 'config.tree.toggle',
      type: ({ config }) => config.tree?.disabled ? '' : this.type.value,
      icon: ({ config }) => config.tree?.disabled ? 'play' : 'stop',
      label: ({ config }) => (config.tree?.disabled ? '启用' : '停用')
        + (config.tree?.name === 'group' ? '分组' : '插件'),
    }, {
      id: '.save',
      icon: ({ config }) => config.tree?.disabled ? 'save' : 'check',
      label: ({ config }) => config.tree?.disabled ? '保存配置' : '重载配置',
    }, {
      id: '@separator',
    }, {
      id: '.rename',
      icon: 'edit',
      label: '重命名',
    }, {
      id: '.remove',
      type: 'danger',
      icon: 'delete',
      label: ({ config }) => config.tree?.children ? '移除分组' : '移除插件',
    }, {
      id: '@separator',
    }, {
      id: '.clone',
      icon: 'clone',
      label: '克隆配置',
    }, {
      id: '.manage',
      icon: 'manage',
      label: '管理多份配置',
    }, {
      id: '.add-plugin',
      icon: 'add-plugin',
      label: '添加插件',
    }, {
      id: '.add-group',
      icon: 'add-group',
      label: '添加分组',
    }])
  }

  get data(): Ref<Data> {
    return this.ctx.$entry!.data
  }

  ensure(name: string, passive?: boolean) {
    const forks = this.plugins.value.forks[name]
    if (!forks?.length) {
      const key = Math.random().toString(36).slice(2, 8)
      send('manager.config.create', { name, disabled: true })
      if (!passive) router.push('/plugins/' + key)
    } else if (forks.length === 1) {
      if (!passive) router.push('/plugins/' + forks[0])
    } else {
      if (!passive) this.dialogFork.value = name
    }
  }

  async remove(tree: string | Node) {
    if (typeof tree === 'string') {
      const forks = this.plugins.value.forks[tree]
      for (const id of forks) {
        const tree = this.plugins.value.paths[id]
        await send('manager.config.remove', { id: tree.id })
      }
    } else {
      await router.replace('/plugins/' + tree.parent!.path)
      await send('manager.config.remove', { id: tree.id })
    }
  }

  get(name: string) {
    return this.plugins.value.forks[name]?.map(id => this.plugins.value.paths[id])
  }

  getStatus(tree: Node) {
    switch (this.data.value.packages[tree.name]?.runtime?.forks?.[tree.path]?.status) {
      case ScopeStatus.PENDING: return 'pending'
      case ScopeStatus.LOADING: return 'loading'
      case ScopeStatus.ACTIVE: return 'active'
      case ScopeStatus.FAILED: return 'failed'
      case ScopeStatus.DISPOSED: return 'disposed'
      default: return 'disabled'
    }
  }

  getEnvInfo(name?: string) {
    function setService(name: string, required: boolean) {
      if (services.has(name)) return
      if (name === 'console') return
      result.using[name] = { required }
    }

    if (!name) return
    const local = this.data.value.packages[name]
    if (!local) return

    const result: EnvInfo = { impl: [], using: {}, peer: {} }
    const services = new Set<string>()

    // check peer dependencies
    for (const name in local.package.peerDependencies ?? {}) {
      if (!name.includes('@cordisjs/plugin-') && !name.includes('cordis-plugin-')) continue
      if (coreDeps.includes(name)) continue
      const required = !local.package.peerDependenciesMeta?.[name]?.optional
      const active = !!this.data.value.packages[name]?.runtime?.id
      result.peer[name] = { required, active }
      for (const service of this.data.value.packages[name]?.manifest?.service?.implements ?? []) {
        services.add(service)
      }
    }

    // check implementations
    for (const name of local.manifest.service?.implements || []) {
      result.impl.push(name)
    }

    // check services
    for (const name of local.runtime?.required ?? []) {
      setService(name, true)
    }
    for (const name of local.runtime?.optional ?? []) {
      setService(name, false)
    }

    // check reusability
    if (local.runtime?.id && !local.runtime?.forkable) {
      result.warning = true
    }

    // check schema
    if (!local.runtime?.schema) {
      result.warning = true
    }

    return result
  }

  hasCoreDeps(tree: Node) {
    if (coreDeps.includes(tree.name)) return true
    if (tree.children) return tree.children.some(node => this.hasCoreDeps(node))
  }
}
