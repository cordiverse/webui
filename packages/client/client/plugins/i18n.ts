import { watchEffect } from 'vue'
import { createI18n } from 'vue-i18n'
import { useConfig } from './setting'
import { Context, Service } from 'cordis'
import { defineProperty } from 'cosmokit'

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
      this.i18n.global.locale.value = config.value.locale!
    }, { flush: 'post' }))
  }
}
