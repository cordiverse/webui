import { Context, Logger, Schema } from 'cordis'
import { Dict, remove, Time } from 'cosmokit'
import { resolve } from 'path'
import { mkdir, readdir, rm } from 'fs/promises'
import {} from '@cordisjs/plugin-webui'
import { FileWriter } from './file'

export const name = 'logger'

export interface Config {
  root: string
  maxAge: number
  maxSize: number
}

export const Config: Schema<Config> = Schema.object({
  root: Schema.string().role('path', {
    filters: ['directory'],
    allowCreate: true,
  }).default('data/logs').description('存放输出日志的本地目录。'),
  maxAge: Schema.natural().default(30).description('日志文件保存的最大天数。'),
  maxSize: Schema.natural().default(1024 * 100).description('单个日志文件的最大大小。'),
})

export const inject = ['webui']

export async function apply(ctx: Context, config: Config) {
  const root = resolve(ctx.baseDir, config.root)
  await mkdir(root, { recursive: true })

  const files: Dict<number[]> = {}
  for (const filename of await readdir(root)) {
    const capture = /^(\d{4}-\d{2}-\d{2})-(\d+)\.log$/.exec(filename)
    if (!capture) continue
    files[capture[1]] ??= []
    files[capture[1]].push(+capture[2])
  }

  let writer: FileWriter
  async function createFile(date: string, index: number) {
    writer = new FileWriter(date, `${root}/${date}-${index}.log`)

    const { maxAge } = config
    if (!maxAge) return

    const now = Date.now()
    for (const date of Object.keys(files)) {
      if (now - +new Date(date) < maxAge * Time.day) continue
      for (const index of files[date]) {
        await rm(`${root}/${date}-${index}.log`).catch((error) => {
          ctx.logger('logger').warn(error)
        })
      }
      delete files[date]
    }
  }

  const date = new Date().toISOString().slice(0, 10)
  createFile(date, Math.max(...files[date] ?? [0]) + 1)

  const entry = ctx.webui.addEntry({
    base: import.meta.url,
    dev: '../client/index.ts',
    prod: [
      '../dist/index.js',
      '../dist/style.css',
    ],
  }, () => writer.data)

  const update = ctx.throttle(() => {
    entry.patch(buffer)
    buffer = []
  }, 100)

  let buffer: Logger.Record[] = []
  const loader = ctx.get('loader')
  const target: Logger.Target = {
    colors: 3,
    record: (record: Logger.Record) => {
      record.meta ||= {}
      const scope = record.meta[Context.current]?.scope
      if (loader && scope) {
        record.meta.paths = loader.paths(scope)
      }
      const date = new Date(record.timestamp).toISOString().slice(0, 10)
      if (writer.date !== date) {
        writer.close()
        files[date] = [1]
        createFile(date, 1)
      }
      writer.write(record)
      buffer.push(record)
      update()
      if (writer.size >= config.maxSize) {
        writer.close()
        const index = Math.max(...files[date] ?? [0]) + 1
        files[date] ??= []
        files[date].push(index)
        createFile(date, index)
      }
    },
  }

  ctx.effect(() => {
    Logger.targets.push(target)
    return () => {
      writer?.close()
      remove(Logger.targets, target)
      if (loader) loader.prolog = []
    }
  })

  for (const record of loader?.prolog || []) {
    target.record!(record)
  }
}
