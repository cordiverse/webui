import { Dict } from 'cosmokit'

export type DependencyMetaKey = 'deprecated' | 'peerDependencies' | 'peerDependenciesMeta'

const DependencyKey = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const
type DependencyKey = typeof DependencyKey[number]

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

export interface PackageJson extends BasePackage, Partial<Record<DependencyKey, Dict<string>>> {
  main?: string
  module?: string
  browser?: string
  bin?: string | Dict<string>
  scripts?: Dict<string>
  exports?: PackageJson.Exports
  keywords: string[]
  engines?: Dict<string>
  os?: string[]
  cpu?: string[]
  peerDependenciesMeta?: Dict<PackageJson.PeerMeta>
}

export namespace PackageJson {
  export type Exports = string | { [key: string]: Exports }

  export interface PeerMeta {
    optional?: boolean
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
  'dist-tags': Dict<string>
}

export interface DatedPackage extends BasePackage {
  date: string
}

export interface SearchPackage extends DatedPackage, Pick<RemotePackage, DependencyMetaKey> {
  links?: Dict<string>
  author?: User
  contributors?: User[]
  keywords: string[]
  publisher: User
  maintainers: User[]
  versions?: string[]
  'dist-tags'?: Dict<string>
}

export interface Manifest {
  description?: string | Dict<string>
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

export interface SearchObject {
  shortname: string
  package: SearchPackage
  searchScore: number
  score: Score
  rating: number
  verified: boolean
  workspace?: boolean
  category?: string
  portable?: boolean
  insecure?: boolean
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

export interface SearchResult<T = SearchObject> {
  total: number
  time: string
  objects: T[]
}
