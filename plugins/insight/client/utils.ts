import * as d3 from 'd3-force'
import * as shared from '../shared'

export interface Node extends shared.Node, d3.SimulationNodeDatum {
  lastX?: number
  lastY?: number
  active?: boolean
}

export interface Link extends Omit<shared.Link, 'source' | 'target'>, d3.SimulationLinkDatum<Node> {
  source: Node
  target: Node
}

export namespace constants {
  export const arrowLength = 10
  export const arrowOffset = 10
  export const arrowAngle = Math.PI / 6
}
