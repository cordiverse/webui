import { Context } from 'cordis'
import type {} from '@cordisjs/database'
import type {} from '@cordisjs/webui'
import z from 'schemastery'
import { Codec } from './codec.ts'

export interface FieldInfo {
  name: string
  type: string
  nullable?: boolean
  primary?: boolean
  unique?: boolean
}

export interface TableInfo {
  name: string
  primary: string[]
  fields: FieldInfo[]
}

export interface Data {
  tables: TableInfo[]
  query(args: QueryArgs): Promise<QueryResult>
  update(args: UpdateArgs): Promise<void>
}

export interface QueryArgs {
  table: string
  limit: number
  offset: number
  sort?: { field: string; direction: 'asc' | 'desc' }
}

export interface QueryResult {
  /** Rows keyed by field name, with values in the JSON representation of their field types. */
  rows: Record<string, unknown>[]
  total: number
}

/**
 * The primary keys in `where` and `value` use the JSON representation of their field types,
 * as in {@link QueryResult}. Other conditions in `where` are passed to the database unchanged.
 */
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
  pageSize: z.natural().default(50).description('The default number of rows on a page.'),
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

function getPath(row: any, path: string) {
  if (path in row) return row[path]
  return path.split('.').reduce((value, key) => value?.[key], row)
}

export function apply(ctx: Context, config: Config) {
  function buildTables(): TableInfo[] {
    const model = ctx.model
    const tables: TableInfo[] = []
    for (const name of Object.keys(model.tables).sort()) {
      const m = model.tables[name]
      tables.push({
        name,
        primary: ([] as string[]).concat(m.primary ?? []),
        fields: describeFields(m),
      })
    }
    return tables
  }

  const entry = ctx.webui.addEntry<Data>({
    baseUrl: import.meta.url,
    source: '../client/index.ts',
    manifest: '../dist/manifest.json',
    routes: ['/database'],
  }, {
    tables: buildTables(),
    async query({ table, limit, offset, sort }) {
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
      const total = stats.tables?.[table]?.count ?? rows.length
      const codec = new Codec(model.types)
      const fields = Object.entries<any>(model.tables[table].fields).filter(([, field]) => field && !field.relation)
      return {
        rows: rows.map((row: any) => Object.fromEntries(fields.map(([name, field]) => {
          return [name, codec.encode(getPath(row, name), field.type)]
        }))),
        total,
      }
    },
    async update({ table, where, field, value }) {
      const model = ctx.model
      const m = model.tables[table]
      if (!m) throw new Error(`unknown table: ${table}`)
      const primary = ([] as string[]).concat(m.primary ?? [])
      if (!primary.length) throw new Error(`table "${table}" has no primary key, cannot update`)
      // conditions other than the primary keys are passed to the database unchanged
      const codec = new Codec(model.types)
      const query: Record<string, unknown> = { ...where }
      for (const key of primary) {
        if (where[key] === undefined || where[key] === null) {
          throw new Error(`missing primary key: ${key}`)
        }
        query[key] = codec.decode(where[key], m.fields[key]?.type, key)
      }
      const meta = m.fields?.[field]
      if (!meta) throw new Error(`unknown field: ${field}`)
      if (primary.includes(field)) throw new Error(`cannot modify primary key: ${field}`)
      if (meta.relation) throw new Error(`cannot modify relation field: ${field}`)
      if (String(meta.deftype ?? meta.type) === 'expr') {
        throw new Error(`cannot modify computed field: ${field}`)
      }
      const result = await (model.set as any)(table, query, { [field]: codec.decode(value, meta.type, field) })
      if (!result || (result.matched ?? 0) === 0) {
        throw new Error('no rows matched')
      }
    },
  })

  ctx.on('database/model' as any, () => {
    entry.mutate((d) => {
      d.tables = buildTables()
    })
  })
}
