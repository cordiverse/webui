import type { SseEvent } from './types'

export function encodeEvent(ev: Pick<SseEvent, 'event' | 'id' | 'retry' | 'data'>): string {
  const lines: string[] = []
  if (ev.id) lines.push(`id: ${ev.id}`)
  if (typeof ev.retry === 'number') lines.push(`retry: ${ev.retry}`)
  if (ev.event) lines.push(`event: ${ev.event}`)
  for (const line of (ev.data ?? '').split('\n')) {
    lines.push(`data: ${line}`)
  }
  lines.push('', '')
  return lines.join('\n')
}

export interface SseParser {
  push(chunk: string): void
  flush(): void
}

export function createSseParser(onEvent: (ev: SseEvent) => void): SseParser {
  let buffer = ''

  function handleBlock(block: string) {
    const ev: SseEvent = { data: '', ts: Date.now() }
    const dataLines: string[] = []
    let seen = false
    for (const raw of block.split('\n')) {
      const line = raw.replace(/\r$/, '')
      if (!line || line.startsWith(':')) continue
      seen = true
      const colonIdx = line.indexOf(':')
      const field = colonIdx < 0 ? line : line.slice(0, colonIdx)
      const value = colonIdx < 0 ? '' : line.slice(colonIdx + 1).replace(/^ /, '')
      switch (field) {
        case 'event': ev.event = value; break
        case 'id': ev.id = value; break
        case 'retry': {
          const n = Number(value)
          if (Number.isFinite(n)) ev.retry = n
          break
        }
        case 'data': dataLines.push(value); break
      }
    }
    if (!seen) return
    ev.data = dataLines.join('\n')
    onEvent(ev)
  }

  return {
    push(chunk: string) {
      buffer += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        handleBlock(block)
      }
    },
    flush() {
      if (buffer.length) {
        handleBlock(buffer)
        buffer = ''
      }
    },
  }
}
