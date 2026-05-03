import { Context } from 'cordis'
import { defineProperty, Dict, pick } from 'cosmokit'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { Dirent } from 'node:fs'
import { readdir, readFile, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import glob from 'fast-glob'
import { Dependency, LocalObject, Manager } from './shared.ts'
import { PackageJson } from './types.ts'
import { Ecosystem, Manifest } from './manifest.ts'
import type { ResolveResult } from '@cordisjs/plugin-loader'

export * from './shared.ts'

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

interface Locator {
  request?: string
  path: string
  workspace: boolean
}

interface Candidate extends Locator {
  package: PackageJson
}

interface PackageLocation {
  name: string
  path: string
}

export default class NodeManager extends Manager {
  private baseDir: string
  private ecosystems: Ecosystem[] = []
  private candidates: Dict<Candidate> = Object.create(null)
  private metaDeps: Dict<string> = Object.create(null)
  private pkgTasks: Dict<Promise<LocalObject | undefined>> = Object.create(null)
  private scanTask?: Promise<Dependency[]>
  private mainTask?: Promise<LocalObject[]>

  constructor(ctx: Context) {
    super(ctx)
    this.baseDir = fileURLToPath(this.ctx.baseUrl!)
  }

  async getDependencies() {
    return (this.scanTask ||= this.scan())
  }

  async getPackages() {
    return (this.mainTask ||= this.collect())
  }

  protected reset() {
    this.scanTask = undefined
    this.mainTask = undefined
    this.candidates = Object.create(null)
    this.metaDeps = Object.create(null)
    this.pkgTasks = Object.create(null)
    this.ecosystems = []
  }

  private async scan() {
    const meta = JSON.parse(await readFile(this.baseDir + '/package.json', 'utf8')) as PackageJson
    for (const key of ['dependencies']) {
      Object.assign(this.metaDeps, meta[key])
    }

    if (pnp) {
      await this.loadPlugAndPlay(pnp)
    } else {
      await this.loadNodeModules()
    }

    return Object.entries(this.metaDeps).map<Dependency>(([name, request]) => {
      return { name, request, ...this.candidates[name] }
    })
  }

  private async collect() {
    await this.getDependencies()

    this.ecosystems.push(Ecosystem.INIT)
    while (this.ecosystems.length) {
      const ecosystem = this.ecosystems.shift()!
      this.loadEcosystem(ecosystem)
    }

    await Promise.allSettled(Object.values(this.pkgTasks))
    return Object.values(this.packages)
  }

  private async loadPlugAndPlay(pnp: PnP) {
    const locators: Dict<Locator> = Object.create(null)

    // workspaces
    if (pnp.getDependencyTreeRoots) {
      for (const locator of pnp.getDependencyTreeRoots()) {
        if (!locator.name) continue
        const info = pnp.getPackageInformation(locator)
        locators[locator.name] = {
          path: info.packageLocation,
          workspace: true,
          request: this.metaDeps[locator.name],
        }
      }
    }

    // dependencies
    for (const name in this.metaDeps) {
      if (name in locators) continue
      const path = pnp.resolveToUnqualified(name, this.baseDir)
      if (!path) continue
      locators[name] = {
        path,
        workspace: false,
        request: this.metaDeps[name],
      }
    }

    await Promise.all(Object.entries(locators).map(async ([name, locator]) => {
      try {
        const meta = await this.loadMeta(join(locator.path, 'package.json'))
        this.candidates[name] = { ...locator, package: meta }
      } catch (error) {
        this.ctx.logger.warn('failed to resolve %c', name)
        this.ctx.logger.debug(error)
      }
    }))
  }

  private async loadNodeModules() {
    // walk up the directory tree, scanning every ancestor's node_modules;
    // innermost level wins on collisions, matching Node's resolve algorithm.
    let root = this.baseDir
    const dirTasks: Promise<PackageLocation[]>[] = []
    while (1) {
      dirTasks.push(this.loadDirectory(root))
      const parent = dirname(root)
      if (root === parent) break
      root = parent
    }
    const locations: Dict<string> = Object.create(null)
    for (const { name, path } of (await Promise.all(dirTasks)).flat(1)) {
      locations[name] ??= path
    }
    const results = await Promise.all(Object.entries(locations).map<Promise<Candidate | undefined>>(async ([name, link]) => {
      try {
        const path = await realpath(link)
        const workspace = !path.includes('node_modules')
        return {
          path,
          package: await this.loadMeta(path + '/package.json'),
          workspace,
          request: this.metaDeps[name],
        }
      } catch (error) {
        this.ctx.logger.warn('failed to resolve %c', name)
        this.ctx.logger.debug(error)
      }
    }))
    for (const result of results) {
      if (!result) continue
      this.candidates[result.package.name] = result
    }
  }

  private async loadDirectory(baseDir: string) {
    const path = baseDir + '/node_modules'
    const dirents = await readdir(path, { withFileTypes: true }).catch<Dirent[]>(() => [])
    const results = await Promise.all(dirents.map(async (outer) => {
      if (!outer.isDirectory() && !outer.isSymbolicLink()) return
      if (outer.name.startsWith('@')) {
        const dirents = await readdir(path + '/' + outer.name, { withFileTypes: true })
        return Promise.all(dirents.map<Promise<PackageLocation | undefined>>(async (inner) => {
          const name = outer.name + '/' + inner.name
          const isLink = inner.isSymbolicLink()
          const isDep = !!this.metaDeps[name]
          if (isLink || isDep) return { name, path: path + '/' + name }
        }))
      } else {
        const isLink = outer.isSymbolicLink()
        const isDep = !!this.metaDeps[outer.name]
        if (isLink || isDep) return { name: outer.name, path: path + '/' + outer.name }
      }
    }))
    return results.flat(1).filter((x): x is PackageLocation => !!x)
  }

  private async loadMeta(filename: string) {
    const meta: PackageJson = JSON.parse(await readFile(filename, 'utf8'))
    meta.peerDependencies ||= {}
    meta.peerDependenciesMeta ||= {}
    return meta
  }

  private loadEcosystem(eco: Ecosystem) {
    for (const [name, { path, package: meta, workspace }] of Object.entries(this.candidates)) {
      const shortname = Ecosystem.check(eco, meta)
      if (!shortname) continue
      // TODO: check for conflicts
      // delete this.candidates[name]
      const manifest = Manifest.conclude(meta, eco.property)
      const exports = manifest.exports ?? {}
      if (exports['.'] !== null) {
        this.pkgTasks[name] ||= this.loadPackage(name, path, {
          shortname,
          workspace,
          manifest,
          package: pick(meta, ['name', 'version']),
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
      this.ecosystems.push(Ecosystem.resolve(name, manifest))
    }
  }

  private async loadPackage(name: string, cwd: string, object: LocalObject) {
    try {
      this.packages[name] = object
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
      await this.onPackageReady(object)
      return object
    } catch (error) {
      this.ctx.logger.warn('failed to resolve %c', name)
      this.ctx.logger.debug(error)
    }
  }

  private async onPackageReady(object: LocalObject) {
    const { name } = object.package
    const { internal } = this.ctx.loader
    if (!internal) return
    try {
      const baseUrl = this.ctx.baseUrl!
      let resolved: ResolveResult
      switch (internal.version) {
        case 'v1': resolved = await internal.resolve(name, baseUrl, {}); break
        case 'v2': resolved = internal.resolveSync(baseUrl, { specifier: name, attributes: {} }); break
      }
      if (internal.loadCache.has(resolved.url)) {
        object.runtime = await this.parseExports(name)
      }
    } catch (error) {
      this.ctx.logger.warn('failed to parse %c', name)
      this.ctx.logger.debug(error)
      object.runtime = null
    }
    this.flushPackage(name)
  }
}
