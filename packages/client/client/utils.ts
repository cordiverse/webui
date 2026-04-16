import { markRaw } from 'vue'

export interface Ordered {
  order?: number
}

export function insert<T extends Ordered>(list: T[], item: T) {
  markRaw(item)
  const index = list.findIndex(a => a.order! < item.order!)
  if (index >= 0) {
    list.splice(index, 0, item)
  } else {
    list.push(item)
  }
}
