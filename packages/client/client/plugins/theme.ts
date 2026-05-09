import { defineProperty, Dict } from 'cosmokit'
import { Schema } from '@cordisjs/components'
import { Context, Service } from 'cordis'
import { Component, ComputedRef, computed, inject, markRaw, reactive, watchEffect } from 'vue'
import { usePreferredDark } from '@vueuse/core'
import { kContext } from '../context'

declare module '..' {
  interface Config {
    theme: Config.Theme
  }

  export namespace Config {
    export interface Theme {
      mode: 'auto' | 'dark' | 'light'
      dark: string
      light: string
    }
  }
}

export interface ThemeOptions {
  id: string
  name: string | Dict<string>
  components?: Dict<Component>
}

// Vue setup-only. For non-setup callers, read `ctx.client.theme.colorMode` directly.
export const useColorMode = (): ComputedRef<'dark' | 'light'> => {
  const ctx = inject(kContext)
  if (!ctx) throw new Error('useColorMode() requires a Vue setup context with kContext provided (use ctx.client.theme.colorMode outside setup)')
  return ctx.client.theme.colorMode
}

export default class ThemeService {
  _themes: Dict<ThemeOptions> = reactive({})

  public colorMode: ComputedRef<'dark' | 'light'>

  constructor(public ctx: Context) {
    defineProperty(this, Service.tracker, {
      property: 'ctx',
    })

    const config = ctx.client.setting.resolved
    const preferDark = usePreferredDark()

    this.colorMode = computed(() => {
      const mode = config.value.theme.mode
      if (mode !== 'auto') return mode
      return preferDark.value ? 'dark' : 'light'
    })

    ctx.client.setting.settings({
      id: 'appearance',
      title: '外观设置',
      order: 900,
      schema: Schema.object({
        theme: Schema.object({
          mode: Schema.union([
            Schema.const('auto').description('跟随系统'),
            Schema.const('dark').description('深色'),
            Schema.const('light').description('浅色'),
          ]).default('auto').description('主题偏好。'),
          dark: Schema.string().role('theme', { mode: 'dark' }).default('default-dark').description('深色主题。'),
          light: Schema.string().role('theme', { mode: 'light' }).default('default-light').description('浅色主题。'),
        }).description('主题设置'),
      }),
    })

    ctx.effect(() => watchEffect(() => {
      if (!config.value.theme) return
      const root = window.document.querySelector('html')!
      root.setAttribute('theme', config.value.theme[this.colorMode.value])
      if (this.colorMode.value === 'dark') {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }, { flush: 'post' }))
  }

  theme(options: ThemeOptions) {
    markRaw(options)
    const config = this.ctx.client.setting.resolved
    for (const [type, component] of Object.entries(options.components || {})) {
      this.ctx.client.router.slot({
        type,
        disabled: () => config.value.theme[this.colorMode.value] !== options.id,
        component,
      })
    }
    return this.ctx.effect(() => {
      this._themes[options.id] = options
      return () => delete this._themes[options.id]
    })
  }
}
