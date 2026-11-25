import { Context, Service } from 'cordis'
import { Dict, Time, valueMap } from 'cosmokit'
import type {} from '@cordisjs/http'
import type {} from '@cordisjs/fs'
import type { PackageJson, Registry, RemotePackage } from './types.ts'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { compare, satisfies, valid } from 'semver'
import z from 'schemastery'

declare module 'cordis' {
  interface Context {
    installer: Installer
  }
}

export interface Dependency {
  request: string
  resolved?: string
  workspace?: boolean
  invalid?: boolean
  latest?: string
}

interface LocalPackage extends PackageJson {
  private?: boolean
  $workspace?: boolean
}

/** The name of the package manager that runs the process, from its user agent. */
function getAgent() {
  const spec = process.env.npm_config_user_agent?.split(' ')[0]
  if (!spec) return
  const name = spec.slice(0, spec.lastIndexOf('/'))
  return name === 'npminstall' ? 'cnpm' : name
}

async function isComponent(dir: string): Promise<boolean> {
  try {
    const meta: PackageJson = JSON.parse(await readFile(join(dir, 'package.json'), 'utf-8'))
    return !!meta.peerDependencies?.cordis
  } catch {
    return false
  }
}

async function listComponentsIn(nm: string): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(nm, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    if (entry.name.startsWith('@')) {
      const inner = await readdir(join(nm, entry.name), { withFileTypes: true }).catch(() => [])
      for (const sub of inner) {
        const full = `${entry.name}/${sub.name}`
        if (await isComponent(join(nm, full))) out.push(full)
      }
    } else if (!entry.name.startsWith('.') && await isComponent(join(nm, entry.name))) {
      out.push(entry.name)
    }
  }
  return out
}

async function loadManifest(filename: string): Promise<LocalPackage> {
  const text = await readFile(filename, 'utf-8')
  const meta: LocalPackage = JSON.parse(text)
  meta.dependencies ||= {}
  return meta
}

function getVersions(versions: RemotePackage[]) {
  return Object.fromEntries(versions
    .map(item => [item.version, item] as const)
    .sort(([a], [b]) => compare(b, a)))
}

class Installer extends Service {
  static name = 'installer'

  public manifestPath!: string
  public endpoint!: string

  private manifest!: LocalPackage
  private depTask?: Promise<Dict<Dependency>>

  constructor(public ctx: Context, public config: Installer.Config) {
    super(ctx, 'installer')
  }

  async [Service.init]() {
    this.manifestPath = fileURLToPath(this.ctx.std.fs.resolve('package.json'))
    this.manifest = await loadManifest(this.manifestPath)
    this.endpoint = this.config.endpoint || 'https://registry.npmjs.org'
  }

  get cwd() {
    // Node.js has a working directory, so `baseUrl` is set
    return fileURLToPath(this.ctx.std.fs.baseUrl!)
  }

  resolveName(name: string): string[] {
    if (name.startsWith('@cordisjs/')) return [name]
    if (name.match(/(^|\/)cordis-plugin-/)) return [name]
    if (name[0] === '@') {
      const [left, right] = name.split('/')
      return [`${left}/cordis-plugin-${right}`]
    }
    return [`@cordisjs/${name}`, `cordis-plugin-${name}`]
  }

  async getPackage(name: string): Promise<Dict<RemotePackage> | undefined> {
    try {
      const registry = await this.ctx.std.http.get<Registry>(`${this.endpoint}/${name}`, {
        timeout: this.config.timeout,
      })
      const filtered = Object.values(registry.versions).filter(remote => !remote.deprecated)
      return getVersions(filtered.length ? filtered : Object.values(registry.versions))
    } catch (e: any) {
      this.ctx.logger.warn('failed to fetch registry for %C: %s', name, e?.message ?? e)
    }
  }

  private async _getDeps() {
    const require = createRequire(this.ctx.std.fs.baseUrl!)
    const result = valueMap(this.manifest.dependencies ?? {}, (request): Dependency => ({
      request: request.replace(/^[~^]/, ''),
    }))
    for (const name of Object.keys(result)) {
      try {
        const filename = require.resolve(`${name}/package.json`)
        const meta = await loadManifest(filename)
        result[name].resolved = meta.version
        result[name].workspace = !filename.includes('node_modules')
      } catch {}
      if (!valid(result[name].request)) {
        result[name].invalid = true
      }
    }

    // Walk node_modules up the directory tree to discover cordis plugins that
    // aren't listed in the root manifest dependencies. Yarn workspace setups
    // typically have an empty root dependencies field — without this step the
    // dependencies page would render "未检测到任何依赖".
    const seen = new Set<string>(Object.keys(result))
    let dir = this.cwd
    while (true) {
      const names = await listComponentsIn(join(dir, 'node_modules'))
      for (const name of names) {
        if (seen.has(name)) continue
        seen.add(name)
        try {
          const filename = require.resolve(`${name}/package.json`)
          const meta = await loadManifest(filename)
          result[name] = {
            request: meta.version ?? '*',
            resolved: meta.version,
            workspace: !filename.includes('node_modules'),
          }
        } catch {}
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }

    return result
  }

  getDeps() {
    return this.depTask ||= this._getDeps()
  }

  refresh() {
    this.depTask = undefined
  }

  async writeManifest(deps: Dict<string | null>) {
    for (const key in deps) {
      if (deps[key]) {
        this.manifest.dependencies![key] = deps[key]!
      } else {
        delete this.manifest.dependencies![key]
      }
    }
    this.manifest.dependencies = Object.fromEntries(
      Object.entries(this.manifest.dependencies!).sort((a, b) => a[0].localeCompare(b[0])),
    )
    await writeFile(this.manifestPath, JSON.stringify(this.manifest, null, 2) + '\n')
  }

  async exec(args: string[]): Promise<number> {
    const name = getAgent() ?? 'npm'
    if (name === 'yarn') {
      args.unshift('--no-immutable')
    } else {
      args.unshift('install')
    }
    return new Promise<number>((resolve) => {
      const child = spawn(name, args, { cwd: this.cwd, shell: process.platform === 'win32' })
      child.stdout.on('data', (data) => {
        for (const line of data.toString().split('\n')) {
          if (line) this.ctx.logger.info(line)
        }
      })
      child.stderr.on('data', (data) => {
        for (const line of data.toString().split('\n')) {
          if (line) this.ctx.logger.warn(line)
        }
      })
      child.on('exit', (code) => resolve(code ?? -1))
      child.on('error', () => resolve(-1))
    })
  }

  async install(deps: Dict<string | null>, forced = false): Promise<number> {
    const oldDeps = { ...this.manifest.dependencies }
    await this.writeManifest(deps)

    for (const name in deps) {
      const resolved = oldDeps[name]?.replace(/^[~^]/, '')
      if (deps[name] && resolved && satisfies(resolved, deps[name]!, { includePrerelease: true })) continue
      forced = true
      break
    }

    if (forced) {
      const code = await this.exec([])
      if (code) return code
    }

    this.refresh()
    await this.ctx.get('_manager')?.refresh()
    return 0
  }
}

namespace Installer {
  export interface Config {
    endpoint?: string
    timeout?: number
  }

  export const Config: z<Config> = z.object({
    endpoint: z.string().role('link').description('The URL of the npm registry. Defaults to `https://registry.npmjs.org`.'),
    timeout: z.number().role('time').default(Time.second * 30).description('The timeout of a request to the registry, in milliseconds.'),
  })
}

export { Installer }
export default Installer
