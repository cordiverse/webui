import { Context, Exporter, Logger, Message } from 'cordis'
import { Time } from 'cosmokit'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import type {} from '@cordisjs/plugin-webui'
import type {} from '@cordisjs/plugin-timer'
import z from 'schemastery'

declare module 'cordis' {
  interface Message {
    entryId?: string
    id?: number
    body?: string
  }
}

export const name = 'logger'

export interface Config {
  path: string
  maxAge: number
  bufferSize: number
}

export const Config: z<Config> = z.object({
  path: z.string().role('path', { filters: ['file'] })
    .default('data/logs.db')
    .description('日志数据库文件路径。'),
  maxAge: z.natural().default(30)
    .description('日志保存的最大天数，0 表示永久保留。'),
  bufferSize: z.natural().default(1000)
    .description('客户端连接时预加载的最新日志条数。'),
})

export const inject = ['webui', 'timer']

export interface Data {
  messages: Message[]
  entryIds: string[]
  read(options: { before?: number; limit?: number }): Promise<Message[]>
}

interface Row {
  id: number
  sn: number
  ts: number
  type: string
  level: number
  name: string
  body: string
  entry_id: string | null
}

function rowToMessage(row: Row): Message {
  const msg: Message = {
    sn: row.sn,
    ts: row.ts,
    type: row.type as any,
    level: row.level as any,
    name: row.name,
    body: row.body,
    args: [],
  }
  msg.id = row.id
  if (row.entry_id) msg.entryId = row.entry_id
  return msg
}

export async function* apply(ctx: Context, config: Config) {
  const filename = fileURLToPath(new URL(config.path, ctx.baseUrl))
  await mkdir(dirname(filename), { recursive: true })

  const db = new DatabaseSync(filename)
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sn INTEGER NOT NULL,
      ts INTEGER NOT NULL,
      type TEXT NOT NULL,
      level INTEGER NOT NULL,
      name TEXT NOT NULL,
      body TEXT NOT NULL,
      entry_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);
  `)

  yield () => db.close()

  if (config.maxAge) {
    const cutoff = Date.now() - config.maxAge * Time.day
    db.prepare('DELETE FROM logs WHERE ts < ?').run(cutoff)
  }

  const insertStmt = db.prepare(
    'INSERT INTO logs (sn, ts, type, level, name, body, entry_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  const selectOlderStmt = db.prepare(
    'SELECT * FROM logs WHERE id < ? ORDER BY id DESC LIMIT ?',
  )
  const selectRecentStmt = db.prepare(
    'SELECT * FROM logs ORDER BY id DESC LIMIT ?',
  )

  const initialRows = selectRecentStmt.all(config.bufferSize) as unknown as Row[]
  const initialMessages: Message[] = initialRows.reverse().map(rowToMessage)

  const distinctRows = db
    .prepare('SELECT DISTINCT entry_id FROM logs WHERE entry_id IS NOT NULL')
    .all() as unknown as { entry_id: string }[]
  const entryIds = new Set<string>(distinctRows.map(row => row.entry_id))

  const entry = ctx.webui.addEntry<Data>({
    baseUrl: import.meta.url,
    source: '../client/index.ts',
    manifest: '../dist/manifest.json',
    routes: ['/logs'],
  }, {
    messages: initialMessages,
    entryIds: [...entryIds],
    async read(options) {
      const limit = Math.min(options.limit ?? 500, 2000)
      const before = options.before ?? Number.MAX_SAFE_INTEGER
      const rows = selectOlderStmt.all(before, limit) as unknown as Row[]
      return rows.reverse().map(rowToMessage)
    },
  })

  let pending: Message[] = []
  const flush = () => {
    if (!pending.length) return
    const batch = pending
    pending = []
    // TODO: trim oldest entries past bufferSize once muon supports a front-truncate op.
    entry.mutate((d) => {
      d.messages.push(...batch)
    })
  }
  const flushThrottled = ctx.throttle(flush, 100)

  const exporter: Exporter = {
    colors: 3,
    export: (message: Message) => {
      const fiber = message.fiber?.deref()
      const entryId = fiber ? ctx.get('loader')?.locate(fiber) : undefined
      if (entryId) message.entryId = entryId

      const body = Logger.format(exporter, message)
      const result = insertStmt.run(
        message.sn,
        message.ts,
        message.type,
        message.level,
        message.name,
        body,
        entryId ?? null,
      )
      message.id = Number(result.lastInsertRowid)
      message.body = body

      pending.push(message)
      flushThrottled()

      if (entryId && !entryIds.has(entryId)) {
        entryIds.add(entryId)
        entry.mutate((d) => {
          d.entryIds.push(entryId)
        })
      }
    },
  }

  ctx.logger.exporter(exporter)

  for (const message of ctx.logger.buffer || []) {
    exporter.export!(message)
  }
}
