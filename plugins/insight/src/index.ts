import { Context, EffectScope, ForkScope, Plugin, Schema, ScopeStatus } from 'cordis'
import { camelize, capitalize } from 'cosmokit'
import { DataService } from '@cordisjs/plugin-webui'
import {} from '@cordisjs/loader'
import assert from 'node:assert'

declare module '@cordisjs/plugin-webui' {
  namespace WebUI {
    interface Services {
      insight: Insight
    }
  }
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

class Insight extends DataService<Insight.Payload> {
  constructor(ctx: Context) {
    super(ctx, 'insight')

    ctx.webui.addEntry({
      dev: import.meta.resolve('../client/index.ts'),
      prod: [
        import.meta.resolve('../dist/index.js'),
        import.meta.resolve('../dist/style.css'),
      ],
    })

    const update = ctx.debounce(() => this.refresh(), 0)
    ctx.on('internal/fork', update)
    ctx.on('internal/runtime', update)
    ctx.on('internal/service', update)
    ctx.on('internal/status', update)
  }

  async get() {
    const nodes: Insight.Node[] = []
    const edges: Insight.Link[] = []

    const services = {} as Record<number, string[]>
    for (const [key, { type }] of Object.entries(this.ctx.root[Context.internal])) {
      if (type !== 'service') continue
      const instance = this.ctx.get(key)
      if (!(instance instanceof Object)) continue
      const ctx: Context = Reflect.getOwnPropertyDescriptor(instance, Context.current)?.value
      if (ctx?.scope.uid) {
        (services[ctx.scope.uid] ||= []).push(key)
      }
    }

    for (const runtime of this.ctx.registry.values()) {
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

      const name = getName(runtime.plugin)

      function addNode(scope: EffectScope) {
        const { uid, entry, disposables, status, runtime } = scope
        assert(uid !== null)
        const weight = disposables.length
        const isGroup = !!runtime.plugin?.[Symbol.for('cordis.group')]
        const isRoot = uid === 0
        const node = { uid, name, weight, status, isGroup, isRoot, services: services[uid!] }
        if (entry) node.name += ` [${entry.options.id}]`
        nodes.push(node)
      }

      function addEdge(type: 'dashed' | 'solid', source: number | null, target: number | null) {
        assert(source !== null)
        assert(target !== null)
        edges.push({ type, source, target })
      }

      const addDeps = (scope: EffectScope) => {
        for (const name of runtime.using) {
          const instance = this.ctx.get(name)
          if (!(instance instanceof Object)) continue
          const ctx: Context = Reflect.getOwnPropertyDescriptor(instance, Context.current)?.value
          const uid = ctx?.scope.uid
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

namespace Insight {
  export interface Payload {
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

  export interface Config {}

  export const Config: Schema<Config> = Schema.object({})
}

export default Insight
