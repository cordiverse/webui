import { clone, Context, Dict, Inject, message, remove, Schema, send, Service } from '@cordisjs/client'
import { computed, reactive, ref, Ref, watch } from 'vue'
import type { Data, EntryData, Provider } from '../src'
import { hasSchema } from './utils'
import Settings from './components/index.vue'
import Forks from './dialogs/forks.vue'
import Select from './dialogs/select.vue'
import Rename from './dialogs/rename.vue'
import Group from './dialogs/group.vue'
import Remove from './dialogs/remove.vue'
import MainPage from './routes/main.vue'
import ReadmePage from './routes/readme.vue'
import ConfigPage from './routes/config.vue'
import EffectsPage from './routes/effects.vue'
import ServicesPage from './routes/services.vue'
import InterceptPage from './routes/intercept.vue'

import './index.scss'
import './icons'

declare module '@cordisjs/client' {
  interface Context {
    manager: Manager
  }

  interface ActionContext {
    'config.tree': EntryData
  }
}

export const coreDeps = [
  '@cordisjs/plugin-webui',
  '@cordisjs/plugin-manager',
  '@cordisjs/plugin-server',
]

export interface Node extends EntryData {
  children?: Node[]
}

interface DepInfo extends Inject.Meta {
  provider?: Provider
}

export interface EnvInfo {
  impl: string[]
  using: Dict<DepInfo>
  warning?: boolean
}

export interface SubRoute {
  path: string
  title: string | ((params: any) => string)
  label?: string | ((params: any) => string)
  component: any
  hidden?(entry: EntryData): boolean
  list?(entry: EntryData): any[]
  indent?: number
  params?: Dict<string>
  order?: number
}

export default class Manager extends Service {
  changes = reactive<Dict<Partial<EntryData>>>({})

  _dialogFork = ref<string>()
  _dialogSelect = ref<string | null>()
  _dialogRemove = ref<EntryData>()
  _dialogRename = ref<EntryData>()
  _dialogCreateGroup = ref<string | null>()

  get dialogFork() {
    return this._dialogFork.value
  }

  set dialogFork(value) {
    this._dialogFork.value = value
  }

  get dialogSelect() {
    return this._dialogSelect.value
  }

  set dialogSelect(value) {
    this._dialogSelect.value = value
  }

  get dialogRemove() {
    return this._dialogRemove.value
  }

  set dialogRemove(value) {
    this._dialogRemove.value = value
  }

  get dialogRename() {
    return this._dialogRename.value
  }

  set dialogRename(value) {
    this._dialogRename.value = value
  }

  get dialogCreateGroup() {
    return this._dialogCreateGroup.value
  }

  set dialogCreateGroup(value) {
    this._dialogCreateGroup.value = value
  }

  get currentEntry() {
    const { path } = this.ctx.$router.router.currentRoute.value
    if (!path.startsWith('/plugins/')) return
    const [id] = path.slice(9).split('/', 1)
    return this.plugins.value.entries[id]
  }

  get currentRoute() {
    const entry = this.currentEntry
    if (!entry) return
    const { path } = this.ctx.$router.router.currentRoute.value
    const rest = path.slice(9 + entry.id.length + 1)
    for (const route of this.routes) {
      const regexp = new RegExp('^' + route.path.replace(/:(\w+)/g, (_, $1) => `(?<${$1}>[^/]+)`) + '$')
      const capture = regexp.exec(rest)
      if (!capture) continue
      const params = capture.groups
      const path = route.path.replace(/:(\w+)/g, (_, $1) => params![$1])
      const title = typeof route.title === 'function' ? route.title(params) : route.title
      const label = route.label ? typeof route.label === 'function' ? route.label(params) : route.label : title
      return { ...route, title, label, path, params }
    }
    return this.routes[0]
  }

  * getRoutes(entry: EntryData) {
    for (const route of this.routes) {
      const matrix = route.list?.(entry) ?? [undefined]
      if (route.hidden?.(entry)) continue
      for (const params of matrix) {
        const path = route.path.replace(/:(\w+)/g, (_, $1) => params[$1] ?? '')
        const title = typeof route.title === 'function' ? route.title(params) : route.title
        const label = route.label ? typeof route.label === 'function' ? route.label(params) : route.label : title
        yield { ...route, title, label, path, params }
      }
    }
  }

  plugins = computed(() => {
    const expanded: string[] = []
    const forks: Dict<string[]> = {}
    const entries: Dict<EntryData> = Object.fromEntries(this.data.value.entries.map(options => [options.id, options]))
    const buildChildren = (parent: string | null) => this.data.value.entries
      .filter(entry => entry.parent === parent)
      .sort((a, b) => a.position - b.position)
      .map((options) => {
        const node: Node = {
          ...options,
          children: buildChildren(options.id),
        }
        forks[options.name] ||= []
        forks[options.name].push(options.id)
        if (options.isGroup && !options.collapse) {
          expanded.push(options.id)
        }
        return node
      })
    const data = buildChildren(null)
    return { data, forks, entries, expanded }
  })

  type = computed(() => {
    const env = this.getEnvInfo(this.currentEntry)
    if (!env) return
    if (env.warning && this.currentEntry!.disabled) return 'warning'
    for (const name in env.using) {
      if (name in this.data.value.services || {}) {
        if (env.impl.includes(name)) return 'warning'
      } else {
        if (env.using[name].required) return 'warning'
      }
    }
  })

  routes = reactive<SubRoute[]>([])

  constructor(ctx: Context, public data: Ref<Data>) {
    super(ctx, 'manager')

    watch(data, (value) => {
      const old = { ...this.changes }
      for (const entry of value.entries) {
        delete old[entry.id]
        this.changes[entry.id] ??= {
          config: clone(entry.config),
          intercept: clone(entry.intercept ?? {}),
        }
      }
      for (const key in old) {
        delete this.changes[key]
      }
    }, { immediate: true })

    this.ctx.slot({
      type: 'global',
      component: Select,
    })

    this.ctx.slot({
      type: 'global',
      component: Forks,
    })

    this.ctx.slot({
      type: 'global',
      component: Rename,
    })

    this.ctx.slot({
      type: 'global',
      component: Remove,
    })

    this.ctx.slot({
      type: 'global',
      component: Group,
    })

    this.ctx.page({
      id: 'plugins',
      path: '/plugins/:id*',
      name: '插件管理',
      icon: 'activity:plugin',
      order: 800,
      authority: 4,
      component: Settings,
    })

    this.subroute({
      path: '',
      title: '概览',
      component: MainPage,
      order: -Infinity,
    })

    this.subroute({
      path: 'readme',
      title: '介绍',
      component: ReadmePage,
      order: -1000,
      hidden: (entry) => {
        return !Object.keys(this.data.value.packages[entry.name]?.readme || {}).length
      },
    })

    this.subroute({
      path: 'config',
      title: '配置',
      component: ConfigPage,
      order: -500,
      hidden: (entry) => {
        return !hasSchema(this.data.value.packages[entry.name]?.runtime?.schema)
      },
    })

    this.subroute({
      path: 'effects',
      title: '作用',
      component: EffectsPage,
      hidden: (entry) => !entry.effects,
      order: 1000,
    })

    this.subroute({
      path: 'service',
      title: '服务管理',
      label: '服务',
      component: ServicesPage,
      order: 500,
      hidden: (entry) => {
        return !this.data.value.packages[entry.name]?.runtime
      },
    })

    this.subroute({
      path: 'service/:name',
      title: ({ name }) => '服务：' + name,
      label: ({ name }) => name,
      component: InterceptPage,
      order: 600,
      hidden: (entry) => {
        return !this.data.value.packages[entry.name]?.runtime
      },
      list: (entry) => {
        const inject = {
          ...Inject.resolve(this.data.value.packages[entry.name]?.runtime?.inject),
          ...Inject.resolve(entry.inject),
        }
        return Object.keys(inject).map(name => ({ name }))
      },
      indent: 1,
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
      label: ({ config }) => config.tree?.isGroup ? '移除分组' : '移除插件',
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

    this.ctx.action('config.tree.rename', {
      hidden: ({ config }) => !config.tree,
      action: ({ config }) => {
        this.dialogRename = config.tree
      },
    })

    this.ctx.action('config.tree.remove', {
      hidden: ({ config }) => !config.tree,
      disabled: ({ config }) => this.hasCoreDeps(config.tree),
      action: ({ config }) => {
        this.dialogRemove = config.tree
      },
    })

    this.ctx.action('config.tree.manage', {
      hidden: ({ config }) => !config.tree || !!config.tree.isGroup,
      action: async ({ config }) => {
        this.dialogFork = config.tree.name
      },
    })

    this.ctx.action('config.tree.clone', {
      hidden: ({ config }) => !config.tree || !!config.tree.isGroup,
      action: async ({ config }) => {
        const id = await send('manager.config.create', {
          name: config.tree.name,
          config: config.tree.config,
          disabled: true,
          parent: config.tree.parent,
          position: config.tree.position + 1,
        })
        this.ctx.$router.router.replace(`/plugins/${id}`)
      },
    })

    this.ctx.action('config.tree.add-plugin', {
      hidden: ({ config }) => config.tree && !config.tree.isGroup,
      action: ({ config }) => this.dialogSelect = config.tree?.id ?? null,
    })

    this.ctx.action('config.tree.add-group', {
      hidden: ({ config }) => config.tree && !config.tree.isGroup,
      action: ({ config }) => {
        this.dialogCreateGroup = config.tree?.id ?? null
      },
    })

    this.ctx.action('config.tree.save', {
      shortcut: 'ctrl+s',
      hidden: ({ config }) => !config.tree,
      action: async ({ config: { tree } }) => {
        const { disabled } = tree
        if (!disabled && !this.checkConfig(tree)) {
          return message.error('当前配置项不满足约束，请检查配置！')
        }
        try {
          await execute(tree, disabled || null)
          message.success(disabled ? '配置已保存。' : '配置已重载。')
        } catch (error) {
          message.error('操作失败，请检查日志！')
        }
      },
    })

    this.ctx.action('config.tree.toggle', {
      hidden: ({ config }) => !config.tree,
      disabled: ({ config }) => this.hasCoreDeps(config.tree),
      action: async ({ config: { tree } }) => {
        const { disabled, name } = tree
        if (disabled && !this.checkConfig(tree)) {
          return message.error('当前配置项不满足约束，请检查配置！')
        }
        try {
          await execute(tree, !disabled || null)
          message.success((name === 'group' ? '分组' : '插件') + (disabled ? '已启用。' : '已停用。'))
        } catch (error) {
          message.error('操作失败，请检查日志！')
        }
      },
    })

    const execute = async (data: EntryData, disabled: true | null) => {
      await send('manager.config.update', {
        id: data.id,
        disabled,
        config: this.changes[data.id].config,
      })
    }
  }

  getLabel(entry: EntryData) {
    if (entry.label) return entry.label
    const cap = /^(@[\w-]+\/)?([\w-]+)/.exec(entry.name)
    if (!cap) return entry.name
    const fullname = cap[0]
    const path = entry.name.slice(fullname.length)
    const local = this.data.value.packages[entry.name]
    if (local) return local.shortname + path
    const patterns = Object.values(this.data.value.packages).flatMap((local) => {
      if (!local.manifest.ecosystem) return []
      return local.manifest.ecosystem.pattern ?? [`${local.package.name}-plugin-*`]
    })
    for (const pattern of patterns) {
      const regexp = new RegExp('^' + pattern.replace('*', '.*') + '$')
      let prefix = '', name = fullname
      if (!pattern.startsWith('@')) {
        prefix = cap[1] || ''
        name = cap[2]
      }
      if (!regexp.test(name)) continue
      const index = pattern.indexOf('*')
      return prefix + name.slice(index) + path
    }
    return fullname + path
  }

  checkConfig(entry: EntryData) {
    let schema = this.data.value.packages[entry.name]?.runtime?.schema
    if (!schema) return true
    try {
      schema = new Schema(schema)
      schema(this.changes[entry.id].config, {
        ignore: value => value instanceof Object && '__jsExpr' in value,
      })
      return true
    } catch {
      return false
    }
  }

  subroute(options: SubRoute) {
    options.order ??= 0
    options.component = this.ctx.wrapComponent(options.component)
    return this.ctx.effect(() => {
      const index = this.routes.findIndex(route => route.order! > options.order!)
      if (index === -1) {
        this.routes.push(options)
      } else {
        this.routes.splice(index, 0, options)
      }
      return () => remove(this.routes, options)
    })
  }

  ensure(name: string, passive?: boolean) {
    const forks = this.plugins.value.forks[name]
    if (!forks?.length) {
      const key = Math.random().toString(36).slice(2, 8)
      send('manager.config.create', { name, disabled: true })
      if (!passive) this.ctx.$router.router.push('/plugins/' + key)
    } else if (forks.length === 1) {
      if (!passive) this.ctx.$router.router.push('/plugins/' + forks[0])
    } else {
      if (!passive) this.dialogFork = name
    }
  }

  async remove(options: string | EntryData) {
    if (typeof options === 'string') {
      const forks = this.plugins.value.forks[options]
      for (const id of forks) {
        const options = this.plugins.value.entries[id]
        await send('manager.config.remove', { id: options.id })
      }
    } else {
      await this.ctx.$router.router.replace('/plugins/' + (options.parent ?? ''))
      await send('manager.config.remove', { id: options.id })
    }
  }

  get(name: string) {
    return this.plugins.value.forks[name]?.map(id => this.plugins.value.entries[id])
  }

  getEnvInfo(entry?: EntryData) {
    if (!entry) return
    const local = this.data.value.packages[entry.name]
    if (!local?.runtime) return

    const result: EnvInfo = { impl: [], using: {} }

    // FIXME check implementations
    for (const name of local.manifest.service?.implements || []) {
      result.impl.push(name)
    }

    // check services
    const setService = (name: string, meta: Inject.Meta) => {
      let provider = this.data.value.services[name]?.root
      let node = entry
      while (node) {
        const label = node.isolate?.[name]
        if (label === true) {
          provider = this.data.value.services[name]?.local[node.id]
        } else if (label) {
          provider = this.data.value.services[name]?.global[node.id]
        } else if (node.parent) {
          node = this.plugins.value.entries[node.parent]
          continue
        }
        break
      }
      result.using[name] = { ...meta, provider }
    }

    for (const [name, info] of Object.entries(Inject.resolve(local.runtime.inject))) {
      setService(name, info)
    }
    for (const [name, info] of Object.entries(Inject.resolve(entry.inject))) {
      setService(name, info)
    }

    // check schema
    if (!local.runtime?.schema) {
      result.warning = true
    }

    return result
  }

  hasCoreDeps(data: EntryData) {
    if (coreDeps.includes(data.name)) return true
    return this.data.value.entries.some(entry => entry.parent === data.id && this.hasCoreDeps(entry))
  }
}
