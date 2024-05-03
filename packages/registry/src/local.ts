import { Awaitable, deduplicate, Dict, pick } from 'cosmokit'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'
import { Dirent } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { DependencyKey, Ecosystem, PackageJson, SearchObject, SearchResult } from './types'
import { conclude } from './utils'

const LocalKey = ['name', 'version', 'peerDependencies', 'peerDependenciesMeta'] as const
type LocalKeys = typeof LocalKey[number]

interface LocalObject extends Pick<SearchObject, 'shortname' | 'ecosystem' | 'workspace' | 'manifest'> {
  package: Pick<PackageJson, LocalKeys>
}

export interface LocalScanner extends SearchResult<LocalObject>, LocalScanner.Options {}

export namespace LocalScanner {
  export interface Options {
    onFailure?(reason: any, name: string): void
    onSuccess?(object: LocalObject): Awaitable<void>
  }
}

function clear(object: Dict) {
  for (const key of Object.keys(object)) {
    delete object[key]
  }
}

interface Candidate {
  meta: PackageJson
  workspace: boolean
}

export class LocalScanner {
  public cache: Dict<LocalObject> = Object.create(null)

  private ecosystems: Ecosystem[] = []
  private candidates: Dict<Candidate> = Object.create(null)
  private dependencies: Dict<string> = Object.create(null)
  private pkgTasks: Dict<Promise<LocalObject | undefined>> = Object.create(null)
  private mainTask?: Promise<LocalObject[]>
  private require!: NodeRequire

  constructor(public baseDir: string, options: LocalScanner.Options = {}) {
    this.require = createRequire(baseDir + '/package.json')
    Object.assign(this, options)
  }

  async _collect() {
    clear(this.cache)
    clear(this.pkgTasks)
    clear(this.candidates)
    clear(this.dependencies)
    this.ecosystems.splice(0)
    const meta = JSON.parse(await readFile(this.baseDir + '/package.json', 'utf8')) as PackageJson
    for (const key of DependencyKey) {
      Object.assign(this.dependencies, meta[key])
    }

    // scan for candidate packages (dependencies and symlinks)
    let root = this.baseDir
    const dirTasks: Promise<string[]>[] = []
    while (1) {
      dirTasks.push(this.loadDirectory(root))
      const parent = dirname(root)
      if (root === parent) break
      root = parent
    }
    const names = deduplicate((await Promise.all(dirTasks)).flat(1))
    const results = await Promise.all(names.map(async (name) => {
      try {
        return await this.loadMeta(name)
      } catch (reason) {
        this.onFailure?.(reason, name)
      }
    }))
    for (const result of results) {
      if (!result) continue
      this.candidates[result.meta.name] = result
    }

    // check for candidates
    this.ecosystems.push({
      manifest: 'cordis',
      pattern: ['cordis-plugin-*', '@cordisjs/plugin-*'],
      keywords: ['cordis', 'plugin'],
      peerDependencies: { cordis: '*' },
    })
    while (this.ecosystems.length) {
      const ecosystem = this.ecosystems.shift()!
      this.loadEcosystem(ecosystem)
    }

    await Promise.allSettled(Object.values(this.pkgTasks))
    return Object.values(this.cache)
  }

  async collect(forced = false) {
    if (forced) delete this.mainTask
    this.objects = await (this.mainTask ||= this._collect())
  }

  private async loadDirectory(baseDir: string) {
    const path = baseDir + '/node_modules'
    const dirents = await readdir(path, { withFileTypes: true }).catch<Dirent[]>(() => [])
    const results = await Promise.all(dirents.map(async (outer) => {
      if (!outer.isDirectory() && !outer.isSymbolicLink()) return
      if (outer.name.startsWith('@')) {
        const dirents = await readdir(path + '/' + outer.name, { withFileTypes: true })
        return Promise.all(dirents.map(async (inner) => {
          const name = outer.name + '/' + inner.name
          const isLink = inner.isSymbolicLink()
          const isDep = !!this.dependencies[name]
          if (isLink || isDep) return name
        }))
      } else {
        const isLink = outer.isSymbolicLink()
        const isDep = !!this.dependencies[outer.name]
        if (isLink || isDep) return outer.name
      }
    }))
    return results.flat(1).filter((x): x is string => !!x)
  }

  private checkEcosystem(meta: PackageJson, eco: Ecosystem) {
    for (const peer in eco.peerDependencies) {
      if (!meta.peerDependencies?.[peer]) return
    }
    for (const pattern of eco.pattern) {
      const regexp = new RegExp('^' + pattern.replace('*', '.*') + '$')
      let prefix = '', name = meta.name
      if (!pattern.startsWith('@')) {
        prefix = /^@.+\//.exec(meta.name)?.[0] || ''
        name = name.slice(prefix.length)
      }
      if (!regexp.test(name)) continue
      const index = pattern.indexOf('*')
      return prefix + name.slice(index)
    }
    if (eco.manifest in meta) return meta.name
  }

  private loadEcosystem(eco: Ecosystem) {
    for (const [name, { meta, workspace }] of Object.entries(this.candidates)) {
      const shortname = this.checkEcosystem(meta, eco)
      if (!shortname) continue
      delete this.candidates[name]
      const manifest = conclude(meta, eco.manifest)
      this.pkgTasks[name] ||= this.loadPackage(name, {
        shortname,
        workspace,
        manifest,
        package: pick(meta, LocalKey),
      })
      if (!manifest.ecosystem) continue
      this.ecosystems.push({
        inject: manifest.ecosystem.inject,
        manifest: manifest.ecosystem.manifest || 'cordis',
        pattern: manifest.ecosystem.pattern || [`${name}-plugin-`],
        keywords: manifest.ecosystem.keywords || [name, 'plugin'],
        peerDependencies: manifest.ecosystem.peerDependencies || { [name]: '*' },
      })
    }
  }

  private async loadPackage(name: string, object: LocalObject) {
    try {
      this.cache[name] = object
      await this.onSuccess?.(object)
      return object
    } catch (error) {
      this.onFailure?.(error, name)
    }
  }

  private async loadMeta(name: string): Promise<Candidate> {
    const filename = this.require.resolve(name + '/package.json')
    const meta: PackageJson = JSON.parse(await readFile(filename, 'utf8'))
    meta.peerDependencies ||= {}
    meta.peerDependenciesMeta ||= {}
    return { meta, workspace: !filename.includes('node_modules') }
  }

  toJSON(): SearchResult<LocalObject> {
    return pick(this, ['total', 'time', 'objects'])
  }
}
