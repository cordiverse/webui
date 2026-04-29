import { createServer, Server } from 'node:http'
import { AddressInfo } from 'node:net'
import type { SearchObject, SearchResult } from '../../src/types.ts'

const now = new Date().toISOString()

const echoEntry: SearchObject = {
  shortname: 'server-echo',
  package: {
    name: '@cordisjs/plugin-server-echo',
    version: '1.0.0',
    description: 'Echo endpoint plugin for @cordisjs/plugin-server',
    date: now,
    keywords: ['cordis', 'plugin', 'server', 'echo'],
    publisher: { name: 'shigma', email: 'shigma10826@gmail.com' },
    maintainers: [{ name: 'shigma', email: 'shigma10826@gmail.com' }],
    peerDependencies: {
      '@cordisjs/plugin-server': '^1.0.0',
      cordis: '^4.0.0-rc.4',
    },
  },
  searchScore: 1,
  score: {
    final: 1,
    detail: { quality: 1, popularity: 0.5, maintenance: 1 },
  },
  rating: 5,
  verified: true,
  license: 'MIT',
  manifest: {
    description: {
      en: 'Echo endpoint plugin for @cordisjs/plugin-server',
      zh: '@cordisjs/plugin-server 的回显端点插件',
    },
  },
  createdAt: now,
  updatedAt: now,
}

const payload: SearchResult = {
  total: 1,
  time: now,
  objects: [echoEntry],
}

export interface MockServer {
  port: number
  close(): Promise<void>
}

export async function startMarketMock(): Promise<MockServer> {
  const server: Server = createServer((req, res) => {
    if (!req.url) {
      res.statusCode = 400
      res.end()
      return
    }
    const path = req.url.split('?')[0]
    if (path === '/index.json') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(payload))
      return
    }
    res.statusCode = 404
    res.end()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    port,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve())
    }),
  }
}
