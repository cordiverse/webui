import { FileHandle, open } from 'fs/promises'
import { Logger } from 'cordis/logger'
import { Buffer } from 'buffer'

export class LogFile {
  public data: Logger.Record[] = []
  public task: Promise<FileHandle>
  public size: number = 0

  private temp: Logger.Record[] = []

  constructor(public date: string, public name: string, public path: string) {
    this.task = open(path, 'a+').then(async (handle) => {
      const buffer = await handle.readFile()
      this.data = LogFile.parse(new TextDecoder().decode(buffer))
      this.size = buffer.byteLength
      return handle
    })
    this.task.then(() => this.flush())
  }

  flush() {
    if (!this.temp.length) return
    this.task = this.task.then(async (handle) => {
      const content = Buffer.from(this.temp.map((record) => JSON.stringify(record) + '\n').join(''))
      await handle.write(content)
      this.data.push(...this.temp)
      this.size += content.byteLength
      this.temp = []
      return handle
    })
  }

  static parse(text: string) {
    return text.split('\n').map<Logger.Record>((line) => {
      try {
        return JSON.parse(line)
      } catch {}
    }).filter(Boolean)
  }

  async read() {
    await this.task
    return this.data
  }

  write(record: Logger.Record) {
    this.temp.push(record)
    this.flush()
  }

  async close() {
    const handle = await this.task
    await handle.close()
  }
}
