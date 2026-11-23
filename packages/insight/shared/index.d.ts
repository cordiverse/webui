import { FiberState } from 'cordis'

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
