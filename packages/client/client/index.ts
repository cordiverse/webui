import install from './components'
import { Context } from './context'

declare module '@cordisjs/plugin-webui' {
  export interface ClientConfig {
    unsupported?: string[]
  }
}

export * from './plugins/action'
export * from './plugins/i18n'
export * from './plugins/loader'
export * from './plugins/router'
export * from './plugins/setting'
export * from './plugins/theme'
export * from './components'
export * from './context'
export * from './data'
export { Service } from './utils'
export { Inject, FiberState } from 'cordis'

export default install

export interface ActionContext {}

export interface Config {
  locale?: string
}

export const root = new Context()

root.app.use(install)

root.on('activity', data => !data)
