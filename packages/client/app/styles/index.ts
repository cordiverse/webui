import { Context } from '@cordisjs/client'

import './index.scss'

export default function (ctx: Context) {
  ctx.client.theme.theme({
    id: 'default-light',
    name: 'Default Light',
  })

  ctx.client.theme.theme({
    id: 'default-dark',
    name: 'Default Dark',
  })

  ctx.client.theme.theme({
    id: 'hc-light',
    name: 'High Contrast Light',
  })

  ctx.client.theme.theme({
    id: 'hc-dark',
    name: 'High Contrast Dark',
  })
}
