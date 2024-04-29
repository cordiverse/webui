/// <reference types="@types/node" />

import { Awaitable, defineProperty, Dict, pick } from 'cosmokit'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'
import { readdir, readFile } from 'node:fs/promises'
import { PackageJson, SearchObject, SearchResult } from './types'
import { conclude } from './utils'

const LocalKeys = ['name', 'version', 'peerDependencies', 'peerDependenciesMeta'] as const
type LocalKeys = typeof LocalKeys[number]

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

export class LocalScanner {
  public cache: Dict<LocalObject> = Object.create(null)

  private subTasks: Dict<Promise<LocalObject | undefined>> = Object.create(null)
  private mainTask?: Promise<LocalObject[]>
  private require!: NodeRequire

  constructor(public baseDir: string, options: LocalScanner.Options = {}) {
    defineProperty(this, 'require', createRequire(baseDir + '/package.json'))
    Object.assign(this, options)
  }

  async _collect() {
    clear(this.cache)
    clear(this.subTasks)
    let root = this.baseDir
    const directoryTasks: Promise<void>[] = []
    while (1) {
      directoryTasks.push(this.loadDirectory(root))
      const parent = dirname(root)
      if (root === parent) break
      root = parent
    }
    await Promise.all(directoryTasks)
    await Promise.allSettled(Object.values(this.subTasks))
    return Object.values(this.cache)
  }

  async collect(forced = false) {
    if (forced) delete this.mainTask
    this.objects = await (this.mainTask ||= this._collect())
  }

  private async loadDirectory(baseDir: string) {
    const base = baseDir + '/node_modules'
    const files = await readdir(base).catch(() => [])
    for (const name of files) {
      if (name.startsWith('cordis-plugin-')) {
        this.loadPackage(name)
      } else if (name.startsWith('@')) {
        const base2 = base + '/' + name
        const files = await readdir(base2).catch(() => [])
        for (const name2 of files) {
          if (name === '@cordisjs' && name2.startsWith('plugin-') || name2.startsWith('cordis-plugin-')) {
            this.loadPackage(name + '/' + name2)
          }
        }
      }
    }
  }

  async loadPackage(name: string) {
    return this.subTasks[name] ||= this._loadPackage(name)
  }

  private async _loadPackage(name: string) {
    try {
      const [meta, workspace] = await this.loadManifest(name)
      const object: LocalObject = {
        workspace,
        manifest: conclude(meta),
        shortname: meta.name.replace(/(cordis-|^@cordisjs\/)plugin-/, ''),
        package: pick(meta, LocalKeys),
      }
      this.cache[name] = object
      await this.onSuccess?.(object)
      return object
    } catch (error) {
      this.onFailure?.(error, name)
    }
  }

  private async loadManifest(name: string) {
    const filename = this.require.resolve(name + '/package.json')
    const meta: PackageJson = JSON.parse(await readFile(filename, 'utf8'))
    meta.peerDependencies ||= {}
    meta.peerDependenciesMeta ||= {}
    return [meta, !filename.includes('node_modules')] as const
  }

  toJSON(): SearchResult<LocalObject> {
    return pick(this, ['total', 'time', 'objects'])
  }
}
