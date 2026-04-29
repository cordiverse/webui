import { createServer } from 'node:net'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const testsDir = dirname(here)
const srcFixture = join(testsDir, 'fixtures', 'app')
const tmpRoot = join(testsDir, '.tmp')

export interface SetupOptions {
  marketEndpoint: string
  serverPort: number
  /** Subdirectory name under .tmp/. Defaults to 'app'. */
  name?: string
}

export interface Fixture {
  cwd: string
}

export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (typeof addr === 'object' && addr) {
        const { port } = addr
        server.close(() => resolve(port))
      } else {
        server.close()
        reject(new Error('failed to get port'))
      }
    })
  })
}

/** Wipe the .tmp directory. Call once at the top of a test file. */
export function resetTmp() {
  rmSync(tmpRoot, { recursive: true, force: true })
}

export async function setupFixture(options: SetupOptions): Promise<Fixture> {
  mkdirSync(tmpRoot, { recursive: true })
  const cwd = join(tmpRoot, options.name ?? 'app')
  rmSync(cwd, { recursive: true, force: true })

  cpSync(srcFixture, cwd, { recursive: true })

  const ymlPath = join(cwd, 'cordis.yml')
  const yml = readFileSync(ymlPath, 'utf-8')
    .replace('__MARKET_ENDPOINT__', options.marketEndpoint)
    .replace('__SERVER_PORT__', String(options.serverPort))
  writeFileSync(ymlPath, yml)

  const result = spawnSync('yarn', ['install'], {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      // avoid yarn treating the fixture as part of an outer workspace
      YARN_ENABLE_GLOBAL_CACHE: process.env.YARN_ENABLE_GLOBAL_CACHE ?? 'true',
    },
  })
  if (result.status !== 0) {
    throw new Error(`yarn install failed in ${cwd} (status ${result.status})`)
  }

  return { cwd }
}
