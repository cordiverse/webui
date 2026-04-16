import { Schema, SchemaBase } from '@cordisjs/components'
import { RemovableRef, useLocalStorage } from '@vueuse/core'
import { Context, Service } from 'cordis'
import { insert, Ordered } from '../utils'
import { defineProperty, Dict, remove } from 'cosmokit'
import { Component, computed, markRaw, reactive, ref, watch } from 'vue'
import { Config } from '..'

// declare module '@cordisjs/schema' {
//   interface SchemaService {
//     component(extension: SchemaBase.Extension): () => void
//   }
// }

interface SettingOptions extends Ordered {
  id: string
  title?: string
  disabled?: () => boolean
  schema?: Schema
  component?: Component
}

export let useStorage = <T extends object>(key: string, version?: number, fallback?: () => T): RemovableRef<T> => {
  const initial = fallback ? fallback() : {} as T
  initial['__version__'] = version
  const storage = useLocalStorage('cordis.webui.' + key, initial)
  if (storage.value['__version__'] !== version) {
    storage.value = initial
  }
  return storage
}

export function provideStorage(factory: typeof useStorage) {
  useStorage = factory
}

export const original = useStorage<Config>('config', undefined, () => ({
  theme: {
    mode: 'auto',
    dark: 'default-dark',
    light: 'default-light',
  },
  locale: 'zh-CN',
}))

export const resolved = ref({} as Config)

export const useConfig = (useOriginal = false) => useOriginal ? original : resolved

export default class SettingService {
  _settings: Dict<SettingOptions[]> = reactive({})

  constructor(public ctx: Context) {
    defineProperty(this, Service.tracker, {
      property: 'ctx',
    })

    this.settings({
      id: '',
      title: '通用设置',
      order: 1000,
      schema: Schema.object({
        locale: Schema.union(['zh-CN', 'en-US']).description('语言设置。'),
      }).description('通用设置'),
    })

    const schema = computed(() => {
      const list: Schema[] = []
      for (const settings of Object.values(this._settings)) {
        for (const options of settings) {
          if (options.schema) {
            list.push(options.schema)
          }
        }
      }
      return Schema.intersect(list)
    })

    const doWatch = () => watch(resolved, (value) => {
      console.debug('config', value)
      original.value = schema.value.simplify(value)
    }, { deep: true })

    let stop = doWatch()

    const update = () => {
      stop?.()
      try {
        resolved.value = schema.value(original.value)
      } catch (error) {
        console.error(error)
      }
      stop = doWatch()
    }

    ctx.effect(() => () => stop?.())

    ctx.effect(() => watch(original, update, { deep: true }))
    ctx.effect(() => watch(schema, update))
  }

  schema(extension: SchemaBase.Extension) {
    extension.component = this.ctx.client.wrapComponent(extension.component)
    return this.ctx.effect(() => {
      SchemaBase.extensions.add(extension)
      return () => SchemaBase.extensions.delete(extension)
    })
  }

  settings(options: SettingOptions) {
    markRaw(options)
    options.order ??= 0
    options.component = this.ctx.client.wrapComponent(options.component)
    return this.ctx.effect(() => {
      const list = this._settings[options.id] ||= []
      insert(list, options)
      return () => {
        remove(list, options)
        if (!list.length) delete this._settings[options.id]
      }
    })
  }
}
