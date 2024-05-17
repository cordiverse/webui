import { Dict } from 'cosmokit'

export interface User {
  name?: string
  email: string
  url?: string
  username?: string
}

export interface BasePackage {
  name: string
  version: string
  description: string
}

export const DependencyKey = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const
export type DependencyKey = typeof DependencyKey[number]

export type DependencyMetaKey = 'deprecated' | 'peerDependencies' | 'peerDependenciesMeta'

export interface PackageJson extends BasePackage, Partial<Record<DependencyKey, Record<string, string>>> {
  main?: string
  module?: string
  browser?: string
  bin?: string | Dict<string>
  scripts?: Dict<string>
  exports?: PackageJson.Exports
  cordis?: Manifest
  keywords: string[]
  engines?: Dict<string>
  os?: string[]
  cpu?: string[]
  overrides?: Dict<PackageJson.Overrides>
  peerDependenciesMeta?: Dict<PackageJson.PeerMeta>
}

export namespace PackageJson {
  export type Exports = string | { [key: string]: Exports }
  export type Overrides = string | { [key: string]: Overrides }

  export interface PeerMeta {
    optional?: boolean
  }
}

export interface IconSvg {
  type: 'svg'
  viewBox: string
  pathData: string
}

export interface Manifest extends Manifest.Export {
  icon?: IconSvg
  hidden?: boolean
  preview?: boolean
  insecure?: boolean
  category?: string
  public?: string[]
  exports?: Dict<Manifest.Export | null>
  ecosystem?: Partial<Ecosystem>
}

export namespace Manifest {
  export interface Export {
    browser?: boolean
    description?: string | Dict<string>
    service?: Manifest.Service
    resources?: Dict
  }

  export interface Service {
    required?: string[]
    optional?: string[]
    implements?: string[]
  }
}

export interface Ecosystem {
  property: string
  inject: string[]
  pattern: string[]
  keywords: string[]
  peerDependencies: Dict<string>
}

export namespace Ecosystem {
  export function check(eco: Ecosystem, meta: PackageJson) {
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
    if (eco.property in meta) return meta.name
  }
}

export interface RemotePackage extends PackageJson {
  deprecated?: string
  author?: User
  contributors?: User[]
  maintainers: User[]
  license: string
  dist: RemotePackage.Dist
}

export namespace RemotePackage {
  export interface Dist {
    shasum: string
    integrity: string
    tarball: string
    fileCount: number
    unpackedSize: number
  }
}

export interface Registry extends BasePackage {
  versions: Dict<RemotePackage>
  time: Dict<string>
  license: string
  readme: string
  readmeFilename: string
}

export interface DatedPackage extends BasePackage {
  date: string
}

export interface SearchPackage extends DatedPackage, Pick<RemotePackage, DependencyMetaKey> {
  // `links` is absent in npmmirror
  links?: Dict<string>
  author?: User
  contributors?: User[]
  keywords: string[]
  publisher: User
  maintainers: User[]
  // npmmirror only
  versions?: string[]
  'dist-tags'?: Dict<string>
}

export interface SearchObject {
  shortname: string
  ecosystem?: string
  package: SearchPackage
  searchScore: number
  score: Score
  rating: number
  verified: boolean
  workspace?: boolean
  category?: string
  portable?: boolean
  insecure?: boolean
  ignored?: boolean
  license: string
  manifest: Manifest
  createdAt: string
  updatedAt: string
  publishSize?: number
  installSize?: number
  downloads?: {
    lastMonth: number
  }
}

export interface Score {
  final: number
  detail: Score.Detail
}

export namespace Score {
  export interface Detail {
    quality: number
    popularity: number
    maintenance: number
  }
}

export interface SearchResult<T = SearchObject> {
  total: number
  time: string
  objects: T[]
  version?: number
  forceTime?: number
}
