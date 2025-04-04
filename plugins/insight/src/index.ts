import { Context, Fiber, Plugin, Schema, FiberState } from 'cordis'
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
  state: FiberState
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
    for (const [name, { type }] of Object.entries(ctx.reflect.props)) {
      if (type !== 'service') continue
      const key = ctx[Context.isolate][name]
      const impl = ctx.reflect.store[key]
      if (!impl?.fiber.uid) continue
      (services[impl.fiber.uid] ??= []).push(name)
    }

    function addNode(fiber: Fiber) {
      const { uid, entry, state, runtime } = fiber
      assert(uid !== null)
      const isGroup = !!runtime?.callback?.[Symbol.for('cordis.group')]
      const isRoot = uid === 0
      const name = getName(runtime?.callback!)
      const node = { uid, name, state, isGroup, isRoot, services: services[uid!] }
      if (entry) node.name += ` [${entry.options.id}]`
      nodes.push(node)
    }

    function addEdge(type: 'dashed' | 'solid', source: number, target: number) {
      edges.push({ type, source, target })
    }

    addNode(ctx.root.fiber)

    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        addNode(fiber)
        addEdge('solid', fiber.parent.fiber.uid!, fiber.uid!)
        for (const [name, meta] of Object.entries(fiber.inject)) {
          if (!meta!.required) continue
          const key = ctx[Context.isolate][name]
          const impl = ctx.reflect.store[key]
          if (!impl?.fiber.uid) continue
          addEdge('dashed', impl.fiber.uid, fiber.uid!)
        }
      }
    }

    return { nodes, edges }
  }
}
