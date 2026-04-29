import { Context, Inject, Service } from 'cordis'
import { Dict, Time, valueMap } from 'cosmokit'
import type {} from '@cordisjs/plugin-http'
import type { PackageJson, Registry, RemotePackage } from './types.ts'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { compare, satisfies, valid } from 'semver'
import which from 'which-pm-runs'
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

function isPluginName(name: string): boolean {
  if (name.startsWith('@cordisjs/plugin-')) return true
  if (/(^|\/)cordis-plugin-/.test(name)) return true
  return false
}

async function listPluginsIn(nm: string): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(nm, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    if (entry.name.startsWith('@')) {
      const inner = await readdir(join(nm, entry.name), { withFileTypes: true }).catch(() => [])
      for (const sub of inner) {
        const full = `${entry.name}/${sub.name}`
        if (isPluginName(full)) out.push(full)
      }
    } else if (isPluginName(entry.name)) {
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

@Inject('logger', true, { name: 'installer' })
class Installer extends Service {
  public manifestPath!: string
  public endpoint!: string
  public fullCache: Dict<Dict<RemotePackage>> = {}

  private manifest!: LocalPackage
  private pkgTasks: Dict<Promise<Dict<RemotePackage> | undefined>> = {}
  private depTask?: Promise<Dict<Dependency>>
  private agent = which()

  constructor(public ctx: Context, public config: Installer.Config) {
    super(ctx, 'installer')
  }

  async [Service.init]() {
    this.manifestPath = fileURLToPath(new URL('package.json', this.ctx.baseUrl))
    this.manifest = await loadManifest(this.manifestPath)
    this.endpoint = this.config.endpoint || 'https://registry.npmjs.org'
  }

  get cwd() {
    return fileURLToPath(this.ctx.baseUrl!)
  }

  resolveName(name: string): string[] {
    if (name.startsWith('@cordisjs/plugin-')) return [name]
    if (name.match(/(^|\/)cordis-plugin-/)) return [name]
    if (name[0] === '@') {
      const [left, right] = name.split('/')
      return [`${left}/cordis-plugin-${right}`]
    }
    return [`@cordisjs/plugin-${name}`, `cordis-plugin-${name}`]
  }

  private async _getPackage(name: string) {
    try {
      const registry = await this.ctx.http.get<Registry>(`${this.endpoint}/${name}`, {
        timeout: this.config.timeout,
      })
      const filtered = Object.values(registry.versions).filter(remote => !remote.deprecated)
      this.fullCache[name] = getVersions(filtered.length ? filtered : Object.values(registry.versions))
      return this.fullCache[name]
    } catch (e: any) {
      this.ctx.logger.warn('failed to fetch registry for %c: %s', name, e?.message ?? e)
    }
  }

  getPackage(name: string) {
    return this.pkgTasks[name] ||= this._getPackage(name)
  }

  async findVersion(names: string[]) {
    for (const name of names) {
      const versions = await this.getPackage(name)
      if (!versions) continue
      const first = Object.keys(versions)[0]
      if (first) return { [name]: first }
    }
  }

  private async _getDeps() {
    const require = createRequire(this.ctx.baseUrl!)
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
      const names = await listPluginsIn(join(dir, 'node_modules'))
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
    this.pkgTasks = {}
    this.fullCache = {}
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
    const name = this.agent?.name ?? 'npm'
    if (name === 'yarn') {
      args.unshift('--no-immutable')
    } else {
      args.unshift('install')
    }
    return new Promise<number>((resolve) => {
      const child = spawn(name, args, { cwd: this.cwd, shell: process.platform === 'win32' })
      const prefix = `[market:${name}]`
      child.stdout.on('data', (data) => {
        for (const line of data.toString().split('\n')) {
          if (line) this.ctx.logger.info('%c %s', prefix, line)
        }
      })
      child.stderr.on('data', (data) => {
        for (const line of data.toString().split('\n')) {
          if (line) this.ctx.logger.warn('%c %s', prefix, line)
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
    endpoint: z.string().role('link').description('npm 源地址；留空默认 registry.npmjs.org。'),
    timeout: z.number().role('time').default(Time.second * 30).description('请求超时时间。'),
  })
}

export { Installer }
export default Installer
