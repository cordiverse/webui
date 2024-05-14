import { Context, Schema, Service } from 'cordis'
import { Dict, isNullable, remove } from 'cosmokit'
import { h } from '@cordisjs/element'
import type { Entry } from '@cordisjs/plugin-webui'

declare module 'cordis' {
  interface Context {
    notifier: NotifierService
  }
}

declare module '@cordisjs/plugin-webui' {
  interface Events {
    'notifier/button'(id: string): void
  }
}

export class Notifier {
  public options: Notifier.Config
  public dispose: () => void

  private actionKeys: string[] = []

  constructor(public ctx: Context, options: h.Fragment | Notifier.Options) {
    this.options = {
      type: 'primary',
      content: [],
    }
    ctx.notifier.store.push(this)
    this.update(options)
    ctx.notifier.entry?.refresh()
    this.dispose = ctx.collect('entry', () => {
      this.clearActions()
      remove(ctx.notifier.store, this)
      ctx.notifier.entry?.refresh()
    })
  }

  clearActions() {
    for (const key of this.actionKeys) {
      delete this.ctx.notifier.actions[key]
    }
    this.actionKeys = []
  }

  update(options: h.Fragment | Notifier.Options) {
    if (typeof options === 'string' || h.isElement(options) || Array.isArray(options)) {
      options = { content: options }
    }
    if (!isNullable(options?.content)) {
      this.clearActions()
      const content = typeof options.content === 'string'
        ? [h('p', options.content)]
        : h.toElementArray(options.content)
      options.content = h.transform(content, ({ type, attrs }) => {
        if (type === 'button' && typeof attrs.onClick === 'function') {
          const key = Math.random().toString(36).slice(2)
          this.ctx.notifier.actions[key] = attrs.onClick
          this.actionKeys.push(key)
          attrs.onClick = key
        }
        return true
      })
    }
    Object.assign(this.options, options)
    this.ctx.notifier.entry?.refresh()
  }

  toJSON(): Notifier.Data {
    return {
      ...this.options,
      content: this.options.content.join(''),
      paths: this.ctx.get('loader')?.paths(this.ctx.scope),
    }
  }
}

export namespace Notifier {
  export type Type = 'primary' | 'success' | 'warning' | 'danger'

  export interface Options<T = h.Fragment> {
    type?: Type
    content?: T
  }

  export interface Config extends Required<Options> {
    content: h[]
  }

  export interface Data extends Required<Options> {
    content: string
    paths?: string[]
  }
}

class NotifierService extends Service {
  public store: Notifier[] = []
  public actions: Dict<() => void> = Object.create(null)
  public entry?: Entry<NotifierService.Data>

  constructor(ctx: Context, public config: NotifierService.Config) {
    super(ctx, 'notifier', true)

    ctx.inject(['webui'], (ctx) => {
      ctx.on('dispose', () => this.entry = undefined)

      this.entry = ctx.webui.addEntry({
        dev: import.meta.resolve('../client/index.ts'),
        prod: [
          import.meta.resolve('../dist/index.js'),
          import.meta.resolve('../dist/style.css'),
        ],
      }, () => ({
        notifiers: this.store.map(notifier => notifier.toJSON()),
      }))

      ctx.webui.addListener('notifier/button', (id: string) => {
        return this.actions[id]()
      })
    })
  }

  message(options: string | Notifier.Options<string>) {
    if (typeof options === 'string') {
      options = { content: options }
    }
    options.type ||= 'primary'
    this.ctx.get('console').broadcast('notifier/message', options)
  }

  create(options: h.Fragment | Notifier.Options) {
    return new Notifier(this[Context.current], options)
  }
}

namespace NotifierService {
  export interface Data {
    notifiers: Notifier.Data[]
  }

  export interface Config {}

  export const Config: Schema<Config> = Schema.object({})
}

export default NotifierService
