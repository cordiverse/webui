import { Awaitable, deduplicate, defineProperty, Dict, pick } from 'cosmokit'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { Dirent } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { DependencyKey, PackageJson, SearchObject, SearchResult } from './types'
import { Ecosystem, Manifest } from './manifest'
import glob from 'fast-glob'

type PnP = typeof import('pnpapi')

let pnp: PnP | undefined

if (process.versions.pnp) {
  try {
    pnp = createRequire(import.meta.url)('pnpapi')
  } catch {}
}

declare module 'pnpapi' {
  function getDependencyTreeRoots(): PackageLocator[]
  function getAllLocators(): PackageLocator[]
}

const LocalKey = ['name', 'version'] as const
type LocalKeys = typeof LocalKey[number]

interface LocalObject extends Pick<SearchObject, 'shortname' | 'ecosystem' | 'workspace' | 'manifest'> {
  package: Pick<PackageJson, LocalKeys>
  readme?: Dict<string | null>
  _readmeFiles?: Dict<string | Promise<string>>
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
  path: string
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

  async collect(forced = false) {
    if (forced) delete this.mainTask
    this.objects = await (this.mainTask ||= this._collect())
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

    if (pnp) {
      await this.loadPlugAndPlay(pnp)
    } else {
      await this.loadNodeModules()
    }

    // check for candidates
    this.ecosystems.push({
      name: 'cordis',
      property: 'cordis',
      inject: [],
      pattern: ['cordis-plugin-*', '@cordisjs/plugin-*'],
      keywords: ['cordis', 'plugin'],
    })
    while (this.ecosystems.length) {
      const ecosystem = this.ecosystems.shift()!
      this.loadEcosystem(ecosystem)
    }

    await Promise.allSettled(Object.values(this.pkgTasks))
    return Object.values(this.cache)
  }

  async loadPlugAndPlay(pnp: PnP) {
    const locators: Dict<[string, boolean]> = Object.create(null)

    // workspaces
    if (pnp.getDependencyTreeRoots) {
      for (const locator of pnp.getDependencyTreeRoots()) {
        if (!locator.name) continue
        const info = pnp.getPackageInformation(locator)
        locators[locator.name] = [info.packageLocation, true]
      }
    }

    // dependencies
    for (const name in this.dependencies) {
      if (name in locators) continue
      const path = pnp.resolveToUnqualified(name, this.baseDir)
      if (!path) continue
      locators[name] = [path, false]
    }

    await Promise.all(Object.entries(locators).map(async ([name, [path, workspace]]) => {
      try {
        this.candidates[name] = {
          path,
          meta: await this.loadMeta(join(path, 'package.json')),
          workspace,
        }
      } catch (reason) {
        this.onFailure?.(reason, name)
      }
    }))
  }

  async loadNodeModules() {
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
    const results = await Promise.all(names.map<Promise<Candidate | undefined>>(async (name) => {
      try {
        const filename = this.require.resolve(name + '/package.json')
        const workspace = !filename.includes('node_modules')
        return {
          path: dirname(filename),
          meta: await this.loadMeta(filename),
          workspace,
        }
      } catch (reason) {
        this.onFailure?.(reason, name)
      }
    }))
    for (const result of results) {
      if (!result) continue
      this.candidates[result.meta.name] = result
    }
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

  private async loadMeta(filename: string) {
    const meta: PackageJson = JSON.parse(await readFile(filename, 'utf8'))
    meta.peerDependencies ||= {}
    meta.peerDependenciesMeta ||= {}
    return meta
  }

  private loadEcosystem(ecosystem: Ecosystem) {
    for (const [name, { path, meta, workspace }] of Object.entries(this.candidates)) {
      const shortname = Ecosystem.check(ecosystem, meta)
      if (!shortname) continue
      delete this.candidates[name]
      const manifest = Manifest.conclude(meta, ecosystem.property)
      const exports = manifest.exports ?? {}
      if (exports['.'] !== null) {
        this.pkgTasks[name] ||= this.loadPackage(name, path, {
          shortname,
          workspace,
          manifest,
          package: pick(meta, LocalKey),
        })
      }
      for (const [path, manifest] of Object.entries(exports)) {
        if (!manifest) continue
        const fullname = join(name, path)
        this.pkgTasks[fullname] ||= this.loadPackage(fullname, path, {
          shortname: join(shortname, path),
          workspace,
          manifest,
          package: {
            name: fullname,
            version: meta.version,
          },
        })
      }
      if (!manifest.ecosystem) continue
      this.ecosystems.push({
        name,
        property: manifest.ecosystem.property || 'cordis',
        inject: manifest.service?.implements || [],
        pattern: manifest.ecosystem.pattern || [`${name}-plugin-*`],
        keywords: manifest.ecosystem.keywords || [name, 'plugin'],
      })
    }
  }

  private async loadPackage(name: string, cwd: string, object: LocalObject) {
    try {
      this.cache[name] = object
      const files = await glob(['README?(.*).md'], { cwd, caseSensitiveMatch: false })
      const readme = {}
      const readmeFiles = {}
      for (const file of files) {
        const locale = file.slice(7, -3)
        readme[locale] = null
        readmeFiles[locale] = join(cwd, file)
      }
      object.readme = readme
      defineProperty(object, '_readmeFiles', readmeFiles)
      await this.onSuccess?.(object)
      return object
    } catch (error) {
      this.onFailure?.(error, name)
    }
  }

  toJSON(): SearchResult<LocalObject> {
    return pick(this, ['total', 'time', 'objects'])
  }
}
