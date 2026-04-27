import { Context } from 'cordis'
import type {} from '@cordisjs/plugin-database'
import type {} from '@cordisjs/plugin-webui'
import z from 'schemastery'

declare module '@cordisjs/plugin-webui' {
  interface Events {
    'database-webui.refresh'(): Promise<void>
    'database-webui.query'(args: QueryArgs): Promise<QueryResult>
    'database-webui.update'(args: UpdateArgs): Promise<void>
  }
}

export interface FieldInfo {
  name: string
  type: string
  nullable?: boolean
  primary?: boolean
  unique?: boolean
}

export interface TableInfo {
  name: string
  count: number
  size?: number
  primary: string[]
  fields: FieldInfo[]
}

export interface Data {
  tables: TableInfo[]
}

export interface QueryArgs {
  table: string
  limit: number
  offset: number
  sort?: { field: string; direction: 'asc' | 'desc' }
}

export interface QueryResult {
  rows: any[]
  total: number
}

export interface UpdateArgs {
  table: string
  where: Record<string, unknown>
  field: string
  value: unknown
}

export const name = 'database-webui'
export const inject = ['model', 'webui']

export interface Config {
  pageSize: number
}

export const Config: z<Config> = z.object({
  pageSize: z.natural().default(50).description('每页默认行数(客户端可改)。'),
})

function describeFields(model: any): FieldInfo[] {
  const primary = new Set<string>(([] as string[]).concat(model.primary ?? []))
  const uniqueKeys = new Set<string>()
  for (const item of model.unique ?? []) {
    for (const key of [].concat(item)) uniqueKeys.add(key)
  }
  const out: FieldInfo[] = []
  for (const [name, field] of Object.entries<any>(model.fields ?? {})) {
    if (!field) continue
    if (field.relation) continue
    out.push({
      name,
      type: String(field.deftype ?? field.type ?? 'unknown'),
      nullable: !!field.nullable,
      primary: primary.has(name),
      unique: uniqueKeys.has(name),
    })
  }
  return out
}

export function apply(ctx: Context, config: Config) {
  // Per-table stats cache. Models themselves are read live from ctx.model.tables
  // on each entry refresh, so newly extended tables show up immediately even
  // before their counts are known.
  const counts: Record<string, { count: number; size: number }> = {}

  function buildSnapshot(): Data {
    const model = ctx.model
    const tables: TableInfo[] = []
    for (const name of Object.keys(model.tables).sort()) {
      const m = model.tables[name]
      const stat = counts[name]
      tables.push({
        name,
        count: stat?.count ?? 0,
        size: stat?.size,
        primary: ([] as string[]).concat(m.primary ?? []),
        fields: describeFields(m),
      })
    }
    return { tables }
  }

  async function refreshStats() {
    const stats = await ctx.model.stats().catch(() => ({ size: 0, tables: {} as Record<string, { count: number; size: number }> }))
    for (const [name, stat] of Object.entries(stats.tables ?? {})) {
      counts[name] = stat
    }
    entry.refresh()
  }

  const entry = ctx.webui.addEntry<Data>({
    path: '@cordisjs/plugin-database-webui/dist',
    base: import.meta.url,
    dev: '../client/index.ts',
    prod: '../dist/manifest.json',
  }, buildSnapshot)

  refreshStats().catch((error: any) => {
    ctx.get('logger')?.warn?.('initial refresh failed: %s', error?.message ?? error)
  })

  ctx.on('database/model' as any, () => {
    // a new table was registered — push the schema immediately, then update
    // counts when stats become available.
    entry.refresh()
    refreshStats().catch(() => {})
  })

  const interval = setInterval(() => refreshStats().catch(() => {}), 10_000)
  ctx.effect(() => () => clearInterval(interval))

  ctx.webui.addListener('database-webui.refresh', async () => {
    await refreshStats()
  })

  ctx.webui.addListener('database-webui.query', async ({ table, limit, offset, sort }) => {
    const model = ctx.model
    if (!model.tables[table]) {
      throw new Error(`unknown table: ${table}`)
    }
    const cursor: any = {
      limit: Math.max(1, Math.min(limit | 0, 1000)),
      offset: Math.max(0, offset | 0),
    }
    if (sort?.field) {
      cursor.sort = { [sort.field]: sort.direction === 'desc' ? 'desc' : 'asc' }
    }
    const rows = await (model.get as any)(table, {}, cursor)
    const stats = await model.stats().catch(() => ({ tables: {} as Record<string, { count: number; size: number }> }))
    for (const [name, stat] of Object.entries(stats.tables ?? {})) {
      counts[name] = stat
    }
    entry.refresh()
    const total = stats.tables?.[table]?.count ?? rows.length
    return { rows, total }
  })

  ctx.webui.addListener('database-webui.update', async ({ table, where, field, value }) => {
    const model = ctx.model
    const m = model.tables[table]
    if (!m) throw new Error(`unknown table: ${table}`)
    const primary = ([] as string[]).concat(m.primary ?? [])
    if (!primary.length) throw new Error(`table "${table}" has no primary key, cannot update`)
    for (const key of primary) {
      if (where[key] === undefined || where[key] === null) {
        throw new Error(`missing primary key: ${key}`)
      }
    }
    const meta = m.fields?.[field]
    if (!meta) throw new Error(`unknown field: ${field}`)
    if (primary.includes(field)) throw new Error(`cannot modify primary key: ${field}`)
    if (meta.relation) throw new Error(`cannot modify relation field: ${field}`)
    if (String(meta.deftype ?? meta.type) === 'expr') {
      throw new Error(`cannot modify computed field: ${field}`)
    }
    const result = await (model.set as any)(table, where, { [field]: value })
    if (!result || (result.matched ?? 0) === 0) {
      throw new Error('no rows matched')
    }
  })
}
