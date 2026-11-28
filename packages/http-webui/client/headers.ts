// the headers that the proxy forwards from `Upstream-<name>`, as listed in `src/index.ts`
const UPSTREAM_HEADERS = ['authorization', 'cookie']

export function proxyHeaderName(name: string) {
  const key = name.toLowerCase()
  if (key.startsWith('upstream-') && UPSTREAM_HEADERS.includes(key.slice(9))) {
    throw new TypeError(`Header "${name}" is reserved by the HTTP request editor.`)
  }
  return UPSTREAM_HEADERS.includes(key) ? 'upstream-' + key : name
}
