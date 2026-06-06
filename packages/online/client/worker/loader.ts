/**
 * Browser-side cordis Loader subclass. Overrides `import(name)` so bare
 * specifiers resolve via a `/-/modules/<name>` URL — intercepted
 * by the service worker in production, and by Vite middleware in dev (see
 * `src/dev.ts`'s `module-prefix` plugin).
 *
 * We also install `this.internal` so that **every `EntryTree` sub-tree**
 * (loader root, include, group, …) routes its imports through us. The base
 * `EntryTree.import` (in `loader/src/config/tree.ts`) only delegates to
 * `this.ctx.loader.internal.import(name, baseUrl, {})` — it does NOT call
 * `BrowserLoader.import` on the root loader. Without an `internal`, sub-trees
 * fall through to `import(/* @vite-ignore *\/name)` which fails on bare
 * specifiers in the browser.
 *
 * Reference base implementation: `external/cordis/packages/loader/src/config/tree.ts`
 * (the `EntryTree.import` method at line 103).
 */

import { Loader } from '@cordisjs/plugin-loader'
import { composeError } from 'cordis'
import { MODULE_PREFIX } from '@cordisjs/online'

function importViaModulePrefix(name: string) {
  if (name.startsWith('.')) {
    throw new Error(`relative imports are not supported in cordis-online: ${name}`)
  }
  const url = MODULE_PREFIX + encodeURI(name)
  return import(/* @vite-ignore */ url)
}

export class BrowserLoader extends Loader {
  override internal: any = {
    import: (name: string, _baseUrl: string, _opts: object) => importViaModulePrefix(name),
  }

  override import(name: string, getOuterStack?: () => string[]) {
    if (name.startsWith('cordis:')) {
      return this.builtins[name.slice(7)]
    }
    return composeError(async (info) => {
      info.offset += 3
      return await importViaModulePrefix(name)
    }, getOuterStack)
  }
}

export default BrowserLoader
