import { Dict } from '@cordisjs/client'

export function flattenRecords<T>(data: Dict<T[] | null>) {
  const keys = Object.keys(data).sort((a, b) => {
    return a.slice(0, 11).localeCompare(b.slice(0, 11)) || +a.slice(11) - +b.slice(11)
  })
  return keys.flatMap(key => data[key] ?? [])
}
