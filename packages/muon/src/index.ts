import { ArrayNode } from './array.ts'
import { BaseNode, registerNodeFactory } from './base.ts'
import { isPlainObject, Mutation } from './common.ts'
import { ObjectNode } from './object.ts'

function createNode(target: any): BaseNode {
  if (Array.isArray(target)) return new ArrayNode(target)
  if (isPlainObject(target)) return new ObjectNode(target)
  throw new TypeError('muon: expected plain object or array')
}

registerNodeFactory(createNode)

export function observe<T extends object>(data: T, fn: (data: T) => void): Mutation | null {
  const root = createNode(data)
  fn(root.makeProxy())
  return root.flush()
}

export * from './apply.ts'
export * from './array.ts'
export * from './base.ts'
export * from './batch.ts'
export * from './common.ts'
export * from './delta.ts'
export * from './object.ts'
