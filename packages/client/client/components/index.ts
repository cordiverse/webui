import { App } from 'vue'
import Markdown from 'marked-vue'
import components from '@cordisjs/components'
import Element, { ElLoading, ElMessage, ElMessageBox } from 'element-plus'

import common from './common'
import * as icons from './icons'
import layout from './layout'
import link from './link'
import slot from './slot'

import 'element-plus/dist/index.css'

export const loading = ElLoading.service
export const message = ElMessage
export const messageBox = ElMessageBox

export * from './common'
export * from './layout'
export * from './link'
export * from './slot'

export * from 'vue-i18n'
export * from '@cordisjs/components'

export { icons }

export default function (app: App) {
  app.use(Element)
  app.component('k-markdown', Markdown)

  app.use(common)
  app.use(components)
  app.use(icons)
  app.use(layout)
  app.use(link)
  app.use(slot)
}
