import type { Data, EntryData, LocalObject } from '../../src'

type EntryInput = Partial<EntryData> & { id: string; name: string }

function entry(input: EntryInput): EntryData {
  return {
    parent: null,
    position: 0,
    ...input,
  } as EntryData
}

function pkg(name: string, extra: Partial<LocalObject> = {}): LocalObject {
  const shortname = name.includes('/plugin-') ? name.split('/plugin-')[1] : name
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
    entry({ id: 'e1', name: '@cordisjs/plugin-echo', position: 0 }),
  ],
  packages: {
    '@cordisjs/plugin-echo': pkg('@cordisjs/plugin-echo'),
  },
}

// Two sibling plugins plus one disabled plugin, flat.
export const flatList: Data = {
  ...base(),
  entries: [
    entry({ id: 'e1', name: '@cordisjs/plugin-echo', position: 0 }),
    entry({ id: 'e2', name: '@cordisjs/plugin-server', position: 1 }),
    entry({ id: 'e3', name: '@cordisjs/plugin-timer', position: 2, disabled: true }),
  ],
  packages: {
    '@cordisjs/plugin-echo': pkg('@cordisjs/plugin-echo'),
    '@cordisjs/plugin-server': pkg('@cordisjs/plugin-server'),
    '@cordisjs/plugin-timer': pkg('@cordisjs/plugin-timer'),
  },
}

// A group with two children; group is expanded (collapse !== true).
export const nestedGroup: Data = {
  ...base(),
  entries: [
    entry({ id: 'g1', name: '@cordisjs/plugin-group', position: 0, isGroup: true, collapse: null }),
    entry({ id: 'c1', name: '@cordisjs/plugin-echo', parent: 'g1', position: 0 }),
    entry({ id: 'c2', name: '@cordisjs/plugin-timer', parent: 'g1', position: 1 }),
    entry({ id: 'sib', name: '@cordisjs/plugin-server', position: 1 }),
  ],
  packages: {
    '@cordisjs/plugin-group': pkg('@cordisjs/plugin-group'),
    '@cordisjs/plugin-echo': pkg('@cordisjs/plugin-echo'),
    '@cordisjs/plugin-timer': pkg('@cordisjs/plugin-timer'),
    '@cordisjs/plugin-server': pkg('@cordisjs/plugin-server'),
  },
}

// An entry whose `name` is not present in `packages` → tree should tag it
// `.not-found`.
export const missingPackage: Data = {
  ...base(),
  entries: [
    entry({ id: 'ok', name: '@cordisjs/plugin-echo', position: 0 }),
    entry({ id: 'missing', name: '@scope/unknown-plugin', position: 1 }),
  ],
  packages: {
    '@cordisjs/plugin-echo': pkg('@cordisjs/plugin-echo'),
  },
}

// Contains one of the coreDeps — Manager.hasCoreDeps should return true for it,
// which disables the remove/toggle menu items.
export const withCoreDep: Data = {
  ...base(),
  entries: [
    entry({ id: 'webui', name: '@cordisjs/plugin-webui', position: 0 }),
    entry({ id: 'other', name: '@cordisjs/plugin-echo', position: 1 }),
  ],
  packages: {
    '@cordisjs/plugin-webui': pkg('@cordisjs/plugin-webui'),
    '@cordisjs/plugin-echo': pkg('@cordisjs/plugin-echo'),
  },
}

// A collapsed group — subtree should not render children by default.
export const collapsedGroup: Data = {
  ...base(),
  entries: [
    entry({ id: 'g1', name: '@cordisjs/plugin-group', position: 0, isGroup: true, collapse: true }),
    entry({ id: 'c1', name: '@cordisjs/plugin-echo', parent: 'g1', position: 0 }),
  ],
  packages: {
    '@cordisjs/plugin-group': pkg('@cordisjs/plugin-group'),
    '@cordisjs/plugin-echo': pkg('@cordisjs/plugin-echo'),
  },
}
