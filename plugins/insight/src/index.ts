import { Context, EffectScope, ForkScope, Plugin, Schema, ScopeStatus } from 'cordis'
import { camelize, capitalize } from 'cosmokit'
import {} from '@cordisjs/plugin-webui'
import {} from '@cordisjs/loader'
import assert from 'node:assert'

export interface Data {
  nodes: Node[]
  edges: Link[]
}

export interface Node {
  uid: number
  name: string
  weight: number
  status: ScopeStatus
  isGroup?: boolean
  isRoot?: boolean
  services?: string[]
}

export interface Link {
  type: 'solid' | 'dashed'
  source: number
  target: number
}

function format(name: string) {
  return capitalize(camelize(name))
}

function getName(plugin: Plugin) {
  if (!plugin) return 'Root'
  if (!plugin.name || plugin.name === 'apply') return 'Anonymous'
  return format(plugin.name)
}

function getSourceId(child: ForkScope) {
  const { scope } = child.parent
  if (scope.runtime.isForkable) {
    return scope.uid
  } else {
    return scope.runtime.uid
  }
}

export const name = 'insight'

export const inject = ['webui']

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

export function apply(ctx: Context) {
  const entry = ctx.webui.addEntry({
    base: import.meta.url,
    dev: '../client/index.ts',
    prod: [
      '../dist/index.js',
      '../dist/style.css',
    ],
  }, getGraph)

  const update = ctx.debounce(() => entry.refresh(), 0)
  ctx.on('internal/fork', update)
  ctx.on('internal/runtime', update)
  ctx.on('internal/service', update)
  ctx.on('internal/status', update)

  function getGraph() {
    const nodes: Node[] = []
    const edges: Link[] = []

    const services = {} as Record<number, string[]>
    for (const [key, { type }] of Object.entries(ctx.root[Context.internal])) {
      if (type !== 'service') continue
      const instance = ctx.get(key)
      if (!(instance instanceof Object)) continue
      const ctx2: Context = Reflect.getOwnPropertyDescriptor(instance, Context.current)?.value
      if (ctx2?.scope.uid) {
        (services[ctx2.scope.uid] ||= []).push(key)
      }
    }

    function addNode(scope: EffectScope) {
      const { uid, entry, disposables, status, runtime } = scope
      assert(uid !== null)
      const weight = disposables.length
      const isGroup = !!runtime.plugin?.[Symbol.for('cordis.group')]
      const isRoot = uid === 0
      const name = getName(runtime.plugin)
      const node = { uid, name, weight, status, isGroup, isRoot, services: services[uid!] }
      if (entry) node.name += ` [${entry.options.id}]`
      nodes.push(node)
    }

    function addEdge(type: 'dashed' | 'solid', source: number | null, target: number | null) {
      assert(source !== null)
      assert(target !== null)
      edges.push({ type, source, target })
    }

    for (const runtime of ctx.registry.values()) {
      // Suppose we have the following types of nodes:
      // - A, B: parent plugin scopes
      // - X, Y: target fork scopes
      // - M:    target main scope
      // - S:    service dependencies

      // We can divide plugins into three categories:
      // 1. fully reusable plugins
      //    will be displayed as A -> X -> S, B -> Y -> S
      // 2. partially reusable plugins
      //    will be displayed as A -> X -> M -> S, B -> Y -> M -> S
      // 3. non-reusable plugins
      //    will be displayed as A -> M -> S, B -> M -> S

      function isActive(scope: EffectScope) {
        // exclude plugins that don't work due to missing dependencies
        // return runtime.using.every(name => scope.ctx[name])
        return true
      }

      const addDeps = (scope: EffectScope) => {
        for (const [name, meta] of Object.entries(runtime.inject)) {
          if (!meta.required) continue
          const instance = ctx.get(name)
          if (!(instance instanceof Object)) continue
          const ctx2: Context = Reflect.getOwnPropertyDescriptor(instance, Context.current)?.value
          const uid = ctx2?.scope.uid
          if (!uid) continue
          addEdge('dashed', uid, scope.uid)
        }
      }

      const isReusable = runtime.plugin?.reusable
      if (!isReusable) {
        if (!isActive(runtime)) continue
        addNode(runtime)
        addDeps(runtime)
      }

      for (const fork of runtime.children) {
        if (runtime.isForkable) {
          if (!isActive(fork)) continue
          addNode(fork)
          addEdge('solid', getSourceId(fork), fork.uid)
          if (!isReusable) {
            addEdge('solid', fork.uid, runtime.uid)
          } else {
            addDeps(fork)
          }
        } else {
          nodes[nodes.length - 1].weight += fork.disposables.length
          addEdge('solid', getSourceId(fork), runtime.uid)
        }
      }
    }

    return { nodes, edges }
  }
}
