/**
 * Tiny static-file server for previewing `dist/`. Run via:
 *   yarn workspace @cordisjs/online serve
 *
 * Defaults to port 3000 (no fallback to other ports — fails loudly if
 * occupied so it doesn't hide a stale dev server).
 */

import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const dist = resolve(here, '../dist')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
}

const server = createServer(async (req, res) => {
  let pathname = decodeURIComponent((req.url ?? '/').split('?', 1)[0])
  if (pathname.endsWith('/')) pathname += 'index.html'
  let filename = join(dist, pathname)
  // Defence against path traversal.
  if (!filename.startsWith(dist)) {
    res.statusCode = 403
    res.end('forbidden')
    return
  }
  let st
  try {
    st = await stat(filename)
  } catch {
    // SPA fallback — serve index.html for unknown routes that look like UI paths.
    filename = join(dist, 'index.html')
    try {
      st = await stat(filename)
    } catch {
      res.statusCode = 404
      res.end('not found')
      return
    }
  }
  if (!st.isFile()) {
    res.statusCode = 404
    res.end('not found')
    return
  }
  res.setHeader('content-type', MIME[extname(filename)] ?? 'application/octet-stream')
  // Cross-origin isolation — see dev.ts for rationale (enables SharedArrayBuffer
  // for @cordisjs/sqlite). Every same-origin response carries the pair.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
  // Don't cache the entry HTML or the SW — they need to update on deploy.
  if (filename.endsWith('index.html') || filename.endsWith('sw.js')) {
    res.setHeader('cache-control', 'no-cache')
  } else {
    res.setHeader('cache-control', 'public, max-age=31536000, immutable')
  }
  createReadStream(filename).pipe(res)
})

const port = Number(process.env.PORT ?? 3000)
server.listen(port, () => {
  console.log(`cordis-online preview at http://localhost:${port}/`)
})
