import { Context, Schema } from 'cordis'
import { Exporter, Message } from 'cordis/logger'
import { Dict, Time } from 'cosmokit'
import { resolve } from 'path'
import { mkdir, readdir, readFile, rm } from 'fs/promises'
import type {} from '@cordisjs/plugin-webui'
import type {} from '@cordisjs/plugin-timer'
import { LogFile } from './file'

declare module '@cordisjs/plugin-webui' {
  interface Events {
    'log.read'(options: { name: string }): Promise<Message[]>
  }
}

declare module 'reggol' {
  interface Message {
    entryId?: string
  }
}

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

export const inject = ['webui', 'timer', 'logger']

export async function* apply(ctx: Context, config: Config) {
  const root = resolve(ctx.baseDir, config.root)
  await mkdir(root, { recursive: true })

  const files: Dict<number[]> = {}
  for (const filename of await readdir(root)) {
    const capture = /^(\d{4}-\d{2}-\d{2})-(\d+)\.log$/.exec(filename)
    if (!capture) continue
    files[capture[1]] ??= []
    files[capture[1]].push(+capture[2])
  }

  let writer: LogFile
  yield () => writer?.close()

  function createFile(date: string, index: number) {
    const name = `${date}-${index}.log`
    writer = new LogFile(date, name, `${root}/${name}`)
    cleanUp()
  }

  function cleanUp() {
    const { maxAge } = config
    if (!maxAge) return

    const now = Date.now()
    for (const date of Object.keys(files)) {
      if (now - +new Date(date) < maxAge * Time.day) continue
      for (const index of files[date]) {
        rm(`${root}/${date}-${index}.log`).catch((error) => {
          ctx.logger('logger').warn(error)
        })
      }
      delete files[date]
    }
  }

  const date = new Date().toISOString().slice(0, 10)
  createFile(date, Math.max(...files[date] ?? [0]) + 1)

  const entry = ctx.webui.addEntry<Dict<Message[] | null>>({
    path: '@cordisjs/plugin-insight/dist',
    base: import.meta.url,
    dev: '../client/index.ts',
    prod: '../dist/manifest.json',
  }, () => ({
    ...Object.fromEntries(Object.entries(files).flatMap(([date, indices]) => {
      return indices.map(index => [`${date}-${index}.log`, null] as const)
    })),
    [writer.name]: writer.data,
  }))

  ctx.webui.addListener('log.read', async (options) => {
    if (options.name === writer.name) {
      return writer.data
    } else {
      const content = await readFile(`${root}/${options.name}`, 'utf8')
      return LogFile.parse(content)
    }
  })

  const flush = () => {
    if (!buffer.length) return
    entry.patch(buffer, writer.name)
    buffer = []
  }

  const flushThrottled = ctx.throttle(flush, 100)

  let buffer: Message[] = []
  const exporter: Exporter = {
    colors: 3,
    export: (message: Message) => {
      const fiber = message.fiber?.deref()
      message.entryId = fiber && ctx.get('loader')?.locate(fiber)
      const date = new Date(message.ts).toISOString().slice(0, 10)
      if (writer.date !== date) {
        flush()
        writer.close()
        files[date] = [1]
        createFile(date, 1)
      }
      writer.write(message)
      buffer.push(message)
      flushThrottled()
      if (writer.size >= config.maxSize) {
        flush()
        writer.close()
        const index = Math.max(...files[date] ?? [0]) + 1
        files[date] ??= []
        files[date].push(index)
        createFile(date, index)
      }
    },
  }

  ctx.logger.exporter(exporter)

  for (const message of ctx.logger.buffer || []) {
    exporter.export!(message)
  }
}
