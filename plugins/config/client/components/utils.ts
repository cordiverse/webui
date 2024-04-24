import { Dict } from 'cosmokit'
import { computed, ref } from 'vue'
import { router, ScopeStatus, send, store } from '@cordisjs/client'
import type { Entry } from '@cordisjs/loader'

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

export const dialogFork = ref<string>()
export const dialogSelect = ref<Tree>()

export const coreDeps = [
  '@cordisjs/plugin-webui',
  '@cordisjs/plugin-config',
  '@cordisjs/server',
]

export function hasCoreDeps(tree: Tree) {
  if (coreDeps.includes('@cordisjs/plugin-' + tree.name)) return true
  if (tree.children) return tree.children.some(hasCoreDeps)
}

function getEnvInfo(name: string) {
  function setService(name: string, required: boolean) {
    if (services.has(name)) return
    if (name === 'console') return
    result.using[name] = { required }
  }

  const local = store.packages[name]
  const result: EnvInfo = { impl: [], using: {}, peer: {} }
  const services = new Set<string>()

  // check peer dependencies
  for (const name in local.package.peerDependencies ?? {}) {
    if (!name.includes('@cordisjs/plugin-') && !name.includes('cordis-plugin-')) continue
    if (coreDeps.includes(name)) continue
    const required = !local.package.peerDependenciesMeta?.[name]?.optional
    const active = !!store.packages[name]?.runtime?.id
    result.peer[name] = { required, active }
    for (const service of store.packages[name]?.manifest?.service.implements ?? []) {
      services.add(service)
    }
  }

  // check implementations
  for (const name of local.manifest.service.implements) {
    if (name === 'adapter') continue
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

export const envMap = computed(() => {
  return Object.fromEntries(Object
    .keys(store.packages)
    .filter(x => x)
    .map(name => [name, getEnvInfo(name)]))
})

declare module '@cordisjs/client' {
  interface ActionContext {
    'config.tree': Tree
  }
}

export interface Tree {
  id: string
  name: string
  path: string
  label?: string
  config?: any
  parent?: Tree
  disabled?: boolean
  children?: Tree[]
}

export const current = ref<Tree>()

export const name = computed(() => {
  if (!(current.value?.name in store.packages)) return
  return current.value.name
})

export const type = computed(() => {
  const env = envMap.value[name.value]
  if (!env) return
  if (env.warning && current.value.disabled) return 'warning'
  for (const name in env.using) {
    if (name in store.services || {}) {
      if (env.impl.includes(name)) return 'warning'
    } else {
      if (env.using[name].required) return 'warning'
    }
  }
})

function getTree(parent: Tree, plugins: any): Tree[] {
  const trees: Tree[] = []
  for (let key in plugins) {
    if (key.startsWith('$')) continue
    const config = plugins[key]
    const node = { config, parent } as Tree
    if (key.startsWith('~')) {
      node.disabled = true
      key = key.slice(1)
    }
    node.name = key.split(':', 1)[0]
    node.id = key
    node.path = key.slice(node.name.length + 1)
    node.label = config?.$label
    if (key.startsWith('group:')) {
      node.children = getTree(node, config)
    }
    trees.push(node)
  }
  return trees
}

export const plugins = computed(() => {
  const expanded: string[] = []
  const forks: Dict<string[]> = {}
  const paths: Dict<Tree> = {}
  function handle(config: Entry.Options[]) {
    return config.map(options => {
      const node: Tree = {
        id: options.id,
        name: options.name,
        path: options.id,
        config: options.config,
      }
      if (options.name === 'cordis/group') {
        node.children = handle(options.config)
      }
      if (!options.collapsed && node.children) {
        expanded.push(node.path)
      }
      forks[node.name] ||= []
      forks[node.name].push(node.path)
      paths[node.path] = node
      return node
    })
  }
  const data = handle(store.config)
  return { data, forks, paths, expanded }
})

export function getStatus(tree: Tree) {
  switch (store.packages?.[tree.name]?.runtime?.forks?.[tree.path]?.status) {
    case ScopeStatus.PENDING: return 'pending'
    case ScopeStatus.LOADING: return 'loading'
    case ScopeStatus.ACTIVE: return 'active'
    case ScopeStatus.FAILED: return 'failed'
    case ScopeStatus.DISPOSED: return 'disposed'
    default: return 'disabled'
  }
}

export async function removeItem(tree: Tree) {
  send('manager/remove', tree.id)
  await router.replace('/plugins/' + tree.parent!.path)
}
