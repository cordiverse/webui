import { markRaw } from 'vue'
import { SchemaBase } from '@cordisjs/client'
import SchemaExpr from '../form/expr.vue'
import SlotMenu from '../form/menu.vue'

export const formProps = {
  slots: {
    menu: markRaw(SlotMenu),
  },
  extensions: [markRaw<SchemaBase.Extension>({
    important: true,
    component: SchemaExpr,
    validate: value => value instanceof Object && '__jsExpr' in value,
  })],
}
