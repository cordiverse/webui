export function formatSize(bytes: number | undefined): string {
  if (bytes == null) return '—'
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export function formatDuration(ms: number | undefined): string {
  if (ms == null) return '—'
  if (ms < 1000) return ms + ' ms'
  return (ms / 1000).toFixed(1) + ' s'
}

export function formatTime(ts: number): string {
  return new Date(ts).toTimeString().slice(0, 8)
}

export function methodClass(method: string): string {
  const m = method.toLowerCase()
  if (['get', 'post', 'put', 'delete', 'patch', 'ws'].includes(m)) return 'method-' + m
  return 'method-other'
}

export function statusClass(status: number): string {
  if (!status) return 'status-err'
  const bucket = Math.floor(status / 100)
  return 'status-' + bucket + 'xx'
}
