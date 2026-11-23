import { App } from 'vue'
import form from 'schemastery-vue'

export { form as SchemaBase }

export * from 'schemastery-vue'

export default function (app: App) {
  app.use(form)
}
