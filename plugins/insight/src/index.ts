import { Context, EffectScope, Plugin, Schema, ScopeStatus } from 'cordis'
import { camelize, capitalize } from 'cosmokit'
import {} from '@cordisjs/plugin-timer'
import {} from '@cordisjs/plugin-webui'
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

export const name = 'insight'

export const inject = ['webui', 'timer']

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

export function apply(ctx: Context) {
  const entry = ctx.webui.addEntry({
    path: '@cordisjs/plugin-insight/dist',
    base: import.meta.url,
    dev: '../client/index.ts',
    prod: '../dist/manifest.json',
  }, getGraph)

  const update = ctx.debounce(() => entry.refresh(), 0)
  ctx.on('internal/plugin', update)
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
        (services[ctx2.scope.uid] ??= []).push(key)
      }
    }

    function addNode(scope: EffectScope) {
      const { uid, entry, disposables, status, runtime } = scope
      assert(uid !== null)
      const weight = disposables.length
      const isGroup = !!runtime?.callback?.[Symbol.for('cordis.group')]
      const isRoot = uid === 0
      const name = getName(runtime?.callback!)
      const node = { uid, name, weight, status, isGroup, isRoot, services: services[uid!] }
      if (entry) node.name += ` [${entry.options.id}]`
      nodes.push(node)
    }

    function addEdge(type: 'dashed' | 'solid', source: number, target: number) {
      edges.push({ type, source, target })
    }

    function isActive(scope: EffectScope) {
      // exclude plugins that don't work due to missing dependencies
      return scope.checkInject()
    }

    addNode(ctx.root.scope)

    for (const runtime of ctx.registry.values()) {
      for (const scope of runtime.scopes) {
        if (!isActive(scope)) continue
        addNode(scope)
        addEdge('solid', scope.parent.scope.uid!, scope.uid!)
        for (const [name, meta] of Object.entries(scope.inject)) {
          if (!meta.required) continue
          const instance = ctx.get(name)
          if (!(instance instanceof Object)) continue
          const ctx2: Context = Reflect.getOwnPropertyDescriptor(instance, Context.current)?.value
          const uid = ctx2?.scope.uid
          if (!uid) continue
          addEdge('dashed', uid!, scope.uid!)
        }
      }
    }

    return { nodes, edges }
  }
}
