import { Dict } from 'cosmokit'
import type { Contact, PackageJSON, PackumentVersion } from '@npm/types'
import { Manifest } from './manifest.ts'

export interface PackageJson extends PackageJSON {
  cordis?: Manifest
}

// npm registry user, as returned by the search endpoint (`publisher` / `maintainers`).
// Differs from `@npm/types`' `Contact` (used by the packument endpoint), which keys on `name`.
export interface NpmUser {
  username: string
  name?: string
  email?: string
}

export interface SearchPackage extends Pick<PackumentVersion,
  | 'name'
  | 'version'
  | 'description'
  | 'keywords'
  | 'author'
  | 'contributors'
  | 'deprecated'
  | 'peerDependencies'
  | 'peerDependenciesMeta'
> {
  date: string
  // `links` is absent in npmmirror
  links?: Dict<string>
  publisher: NpmUser
  maintainers: NpmUser[]
  // npmmirror only
  versions?: string[]
  'dist-tags'?: Dict<string>
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
}
