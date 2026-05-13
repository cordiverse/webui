/**
 * Multi-instance manager. Ports `koishi-online`'s `app/utils.ts` to the cordis
 * Loader API. Each "instance" is a directory under `INSTANCES_ROOT` in the
 * IndexedDB-backed filesystem (`@cordisjs/fs`), containing a `cordis.yml`
 * and a `data/` subtree for per-instance state.
 *
 * Switching instances triggers a page reload — the cordis Loader has no
 * supported "rebase to a new config file" path, and reload sidesteps the
 * fiber-lifecycle complexity around safely tearing down all live plugins.
 */

import { ref, shallowRef } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { dump, load } from 'js-yaml'
import { promises as fs } from 'fs'
import type { Dict } from '@cordisjs/client'

export const INSTANCES_ROOT = '/cordis/online/v1/instances'

const STORAGE_KEY = 'cordis-online'
const STORAGE_VERSION = 1

export interface Instance {
  name: string
  lastVisit: number
}

interface StorageData {
  version?: number
  current?: string
}

export const storage = useLocalStorage<StorageData>(STORAGE_KEY, { version: STORAGE_VERSION })
if (storage.value.version !== STORAGE_VERSION) {
  storage.value = { version: STORAGE_VERSION }
}

export const instances = ref<Dict<Instance>>({})
export const storageData = shallowRef<Record<string, any>>({})

/** Persist the instance index to disk. */
export async function flush(): Promise<void> {
  await fs.writeFile(`${INSTANCES_ROOT}/index.json`, JSON.stringify(instances.value))
}

/** Remove an instance and its entire data directory. */
export async function remove(id: string): Promise<void> {
  await fs.rm(`${INSTANCES_ROOT}/${id}`, { recursive: true })
  delete instances.value[id]
  await flush()
}

interface EntryOptions {
  id: string
  name: string
  label?: string
  disabled?: boolean
  config?: EntryOptions[] | Record<string, unknown>
}

function randomId() {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Default config injected on first boot of a new instance. Kept intentionally
 * small — users add more from the marketplace. Cordis entry trees are arrays
 * of `{ id, name, config? }`; nested groups use `@cordisjs/plugin-group` with
 * a nested `config:` array.
 *
 * Online deployment notes:
 *   - `@cordisjs/plugin-webui` is plugged directly by `bootstrap.ts` as
 *     `OnlineWebUI`, so it is NOT listed here.
 *   - `@cordisjs/plugin-logger-webui` (node:sqlite) and
 *     `@cordisjs/plugin-market` (node:child_process) are disabled until
 *     browser shims for those Node builtins exist.
 */
function defaultConfig(): EntryOptions[] {
  return [
    { id: randomId(), name: '@cordisjs/plugin-timer' },
    {
      id: randomId(),
      name: '@cordisjs/plugin-group',
      label: 'WebUI',
      config: [
        { id: randomId(), name: '@cordisjs/plugin-loader-webui' },
        { id: randomId(), name: '@cordisjs/plugin-notifier' },
      ],
    },
  ]
}

/**
 * Pick an instance to make current and reload. After reload, `bootstrap.ts`
 * reads `storage.current` and boots the cordis stack against that instance's
 * directory.
 */
export async function activate(id?: string, _event?: Event, config?: any): Promise<void> {
  id ||= Math.random().toString(36).slice(2, 10)
  const dir = `${INSTANCES_ROOT}/${id}`
  await fs.mkdir(`${dir}/data/storage`, { recursive: true })
  const filename = `${dir}/cordis.yml`
  let needsBoot = false
  try {
    await fs.access(filename)
  } catch {
    const seed = config ?? defaultConfig()
    delete seed.share
    await fs.writeFile(filename, dump(seed))
    needsBoot = true
  }
  if (needsBoot || !instances.value[id]) {
    instances.value[id] = {
      name: config?.share?.name ?? id,
      lastVisit: Date.now(),
    }
    await flush()
  } else {
    instances.value[id].lastVisit = Date.now()
    await flush()
  }
  storage.value = { ...storage.value, current: id }
  location.reload()
}

function isObject(value: any): value is Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
}

/** Read or recover the instances index. */
async function readInstancesIndex(): Promise<Dict<Instance>> {
  let raw = ''
  try {
    raw = await fs.readFile(`${INSTANCES_ROOT}/index.json`, 'utf8')
  } catch {
    // Cold start — enumerate sub-directories.
    const entries = await fs.readdir(INSTANCES_ROOT, { withFileTypes: true }).catch(() => [] as any[])
    const result: Dict<Instance> = {}
    for (const ent of entries) {
      if (typeof ent === 'object' && ent.isDirectory && ent.isDirectory()) {
        result[ent.name] = { name: ent.name, lastVisit: 0 }
      }
    }
    return result
  }
  if (!raw) return {}
  const parsed = JSON.parse(raw)
  if (!isObject(parsed)) throw new Error('invalid instance index')
  for (const id in parsed) {
    parsed[id].name ??= id
    parsed[id].lastVisit ??= 0
  }
  return parsed
}

/** Generate a share-link that encodes the current instance's config. */
export async function shareLink(id: string): Promise<string> {
  const yamlText = await fs.readFile(`${INSTANCES_ROOT}/${id}/cordis.yml`, 'utf8')
  const config: any = load(yamlText)
  config.share = instances.value[id]
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(config))))
  return location.origin + location.pathname + '?share=' + encoded
}

/**
 * Initial scan. Called by `bootstrap.ts` before the cordis Loader starts.
 * Handles the `?share=` URL parameter by importing the encoded config into
 * a fresh instance.
 */
export async function initialize(): Promise<string | undefined> {
  await fs.mkdir(INSTANCES_ROOT, { recursive: true })
  try {
    instances.value = await readInstancesIndex()
  } catch (e) {
    console.warn('[online] instance index recovery:', e)
    instances.value = {}
    await fs.rm(INSTANCES_ROOT, { recursive: true }).catch(() => {})
    await fs.mkdir(INSTANCES_ROOT, { recursive: true })
  }
  const share = new URLSearchParams(location.search).get('share')
  if (share) {
    const decoded = decodeURIComponent(escape(atob(share)))
    const config = JSON.parse(decoded)
    history.replaceState({}, '', location.origin + location.pathname)
    await activate(undefined, undefined, config)
    return undefined // unreachable: activate() reloads.
  }
  return storage.value.current
}
