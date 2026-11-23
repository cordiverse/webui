import { Component, Context, Fiber } from 'cordis'
import { camelize, capitalize } from 'cosmokit'
import type {} from '@cordisjs/timer'
import type {} from '@cordisjs/webui'
import type {} from '@cordisjs/loader'
import type { Link, Node } from '../shared/index.d.ts'
import z from 'schemastery'
import assert from 'node:assert'

function format(name: string) {
  return capitalize(camelize(name))
}

function getName(component: Component) {
  if (!component) return 'Root'
  if (!component.name || component.name === 'apply') return 'Anonymous'
  return format(component.name)
}

export const name = 'insight'

export const inject = ['webui', 'timer']

export interface Config {}

export const Config: z<Config> = z.object({})

export function apply(ctx: Context) {
  const entry = ctx.webui.addEntry<{ nodes: Node[]; edges: Link[] }>({
    baseUrl: import.meta.url,
    source: '../client/index.ts',
    manifest: '../dist/manifest.json',
    routes: ['/graph'],
  }, getGraph())

  const update = ctx.debounce(() => {
    entry.mutate((d) => {
      const next = getGraph()
      d.nodes = next.nodes
      d.edges = next.edges
    })
  }, 0)
  ctx.on('internal/plugin', update)
  ctx.on('internal/replace', update)
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
      const { uid } = impl?.ctx.fiber ?? {}
      if (!uid) continue
      (services[uid] ??= []).push(name)
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

    addNode(ctx[Context.root].fiber)

    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        addNode(fiber)
        addEdge('solid', fiber.parent.fiber.uid!, fiber.uid!)
        for (const name of Object.keys(fiber.inject)) {
          const key = ctx[Context.isolate][name]
          const impl = ctx.reflect.store[key]
          const uid = impl?.ctx.fiber.uid
          if (!uid) continue
          addEdge('dashed', uid, fiber.uid!)
        }
      }
    }

    return { nodes, edges }
  }
}
