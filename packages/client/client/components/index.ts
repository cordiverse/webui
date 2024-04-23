import { App } from 'vue'
import Markdown from 'marked-vue'
import components, { SchemaBase } from '@cordisjs/components'
import Element, { ElLoading, ElMessage, ElMessageBox } from 'element-plus'

import { store } from '../data'
import common from './common'
import Dynamic from './dynamic.vue'
import Perms from './perms.vue'
import ChatImage from './chat/image.vue'
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

export { icons, ChatImage }

SchemaBase.extensions.add({
  type: 'any',
  role: 'dynamic',
  component: Dynamic,
})

SchemaBase.extensions.add({
  type: 'array',
  role: 'perms',
  component: Perms,
  // @ts-ignore
  validate: () => !!store.permissions,
})

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
