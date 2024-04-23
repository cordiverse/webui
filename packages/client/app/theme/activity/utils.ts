import { Activity, Dict } from '@cordisjs/client'

declare module '@cordisjs/client' {
  interface ActionContext {
    'theme.activity': Activity
  }

  interface Config {
    activities: Dict<ActivityOverride>
  }
}

interface ActivityOverride {
  hidden?: boolean
  parent?: string
  order?: number
  position?: 'top' | 'bottom'
}
