import type { Data, EntryData, LocalObject } from '../../src/index.ts'

type EntryInput = Partial<EntryData> & { id: string; name: string }

function entry(input: EntryInput): EntryData {
  return {
    parent: null,
    position: 0,
    ...input,
  } as EntryData
}

function pkg(name: string, extra: Partial<LocalObject> = {}): LocalObject {
  const shortname = name.replace(/^@cordisjs\//, '')
  return {
    shortname,
    package: { name, version: '1.0.0' },
    manifest: {},
    runtime: { inject: {} },
    ...extra,
  } as LocalObject
}

function base(): Data {
  return {
    entries: [],
    packages: {},
    services: {},
    prefix: '',
  }
}

export const emptyData: Data = base()

export const singlePlugin: Data = {
  ...base(),
  entries: [
    entry({ id: 'e1', name: '@cordisjs/echo', position: 0 }),
  ],
  packages: {
    '@cordisjs/echo': pkg('@cordisjs/echo'),
  },
}

// Two sibling plugins plus one disabled plugin, flat.
export const flatList: Data = {
  ...base(),
  entries: [
    entry({ id: 'e1', name: '@cordisjs/echo', position: 0 }),
    entry({ id: 'e2', name: '@cordisjs/server', position: 1 }),
    entry({ id: 'e3', name: '@cordisjs/timer', position: 2, disabled: true }),
  ],
  packages: {
    '@cordisjs/echo': pkg('@cordisjs/echo'),
    '@cordisjs/server': pkg('@cordisjs/server'),
    '@cordisjs/timer': pkg('@cordisjs/timer'),
  },
}

// A group with two children; group is expanded (collapse !== true).
export const nestedGroup: Data = {
  ...base(),
  entries: [
    entry({ id: 'g1', name: '@cordisjs/group', position: 0, isGroup: true, collapse: null }),
    entry({ id: 'c1', name: '@cordisjs/echo', parent: 'g1', position: 0 }),
    entry({ id: 'c2', name: '@cordisjs/timer', parent: 'g1', position: 1 }),
    entry({ id: 'sib', name: '@cordisjs/server', position: 1 }),
  ],
  packages: {
    '@cordisjs/group': pkg('@cordisjs/group'),
    '@cordisjs/echo': pkg('@cordisjs/echo'),
    '@cordisjs/timer': pkg('@cordisjs/timer'),
    '@cordisjs/server': pkg('@cordisjs/server'),
  },
}

// An entry whose `name` is not present in `packages` → tree should tag it
// `.not-found`.
export const missingPackage: Data = {
  ...base(),
  entries: [
    entry({ id: 'ok', name: '@cordisjs/echo', position: 0 }),
    entry({ id: 'missing', name: '@scope/unknown-plugin', position: 1 }),
  ],
  packages: {
    '@cordisjs/echo': pkg('@cordisjs/echo'),
  },
}

// Contains one of the coreDeps — Manager.hasCoreDeps should return true for it,
// which disables the remove/toggle menu items.
export const withCoreDep: Data = {
  ...base(),
  entries: [
    entry({ id: 'webui', name: '@cordisjs/webui', position: 0 }),
    entry({ id: 'other', name: '@cordisjs/echo', position: 1 }),
  ],
  packages: {
    '@cordisjs/webui': pkg('@cordisjs/webui'),
    '@cordisjs/echo': pkg('@cordisjs/echo'),
  },
}

// A collapsed group — subtree should not render children by default.
export const collapsedGroup: Data = {
  ...base(),
  entries: [
    entry({ id: 'g1', name: '@cordisjs/group', position: 0, isGroup: true, collapse: true }),
    entry({ id: 'c1', name: '@cordisjs/echo', parent: 'g1', position: 0 }),
  ],
  packages: {
    '@cordisjs/group': pkg('@cordisjs/group'),
    '@cordisjs/echo': pkg('@cordisjs/echo'),
  },
}
