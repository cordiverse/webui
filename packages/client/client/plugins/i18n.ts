import { watchEffect } from 'vue'
import { createI18n } from 'vue-i18n'
import { useConfig } from './setting'
import { Context } from '../context'
import { Service } from '../utils'
import { defineProperty } from 'cosmokit'

declare module '../context' {
  interface Context {
    $i18n: I18nService
  }
}

const config = useConfig()

export default class I18nService {
  public i18n = createI18n({
    legacy: false,
    fallbackLocale: 'zh-CN',
  })

  constructor(public ctx: Context) {
    defineProperty(this, Service.tracker, {
      property: 'ctx',
    })

    ctx.effect(() => watchEffect(() => {
      this.i18n.global.locale.value = config.value.locale
    }, { flush: 'post' }))
  }
}
