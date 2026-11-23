import { createServer } from 'node:net'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const testsDir = dirname(here)
const srcFixture = join(testsDir, 'fixtures', 'app')
// Outside the repository: a fixture links the workspace packages through
// portals, and a portal inside the repository would form a symlink cycle.
const tmpRoot = join(tmpdir(), 'cordis-market-tests')

function yarnInstall(cwd: string) {
  const result = spawnSync('yarn', ['install'], {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      // portals are rewritten to absolute paths, which updates the lockfile
      YARN_ENABLE_IMMUTABLE_INSTALLS: 'false',
      YARN_ENABLE_GLOBAL_CACHE: process.env.YARN_ENABLE_GLOBAL_CACHE ?? 'true',
    },
  })
  if (result.status !== 0) {
    throw new Error(`yarn install failed in ${cwd} (status ${result.status})`)
  }
}

export interface SetupOptions {
  marketEndpoint: string
  serverPort: number
  /** Subdirectory name under the temporary root. Defaults to 'app'. */
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

/** Wipe the temporary root. Call once at the top of a test file. */
export function resetTmp() {
  rmSync(tmpRoot, { recursive: true, force: true })
}

export async function setupFixture(options: SetupOptions): Promise<Fixture> {
  mkdirSync(tmpRoot, { recursive: true })
  const cwd = join(tmpRoot, options.name ?? 'app')
  rmSync(cwd, { recursive: true, force: true })
  cpSync(srcFixture, cwd, {
    recursive: true,
    filter: source => !/[\\/](node_modules|\.yarn)$/.test(source),
  })

  const manifestPath = join(cwd, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  for (const [name, spec] of Object.entries<string>(manifest.dependencies)) {
    if (!spec.startsWith('portal:')) continue
    manifest.dependencies[name] = 'portal:' + resolve(srcFixture, spec.slice(7))
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

  const ymlPath = join(cwd, 'cordis.yml')
  const yml = readFileSync(ymlPath, 'utf-8')
    .replace('__MARKET_ENDPOINT__', options.marketEndpoint)
    .replace('__SERVER_PORT__', String(options.serverPort))
  writeFileSync(ymlPath, yml)

  yarnInstall(cwd)
  return { cwd }
}
