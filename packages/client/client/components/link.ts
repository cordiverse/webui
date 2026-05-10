import { App, defineComponent, h } from 'vue'
import { useContext } from '../context'

const KActivityLink = defineComponent({
  props: {
    id: {
      type: String,
      required: true,
    },
  },
  setup(props, { slots }) {
    const ctx = useContext()
    return () => {
      const activity = ctx.client.router.pages[props.id]
      // Default target = strip every `{...}` optional group from the
      // pattern (e.g. `/plugins{/*id}` → `/plugins`). path-to-regexp v8
      // wraps every wildcard / optional segment in braces, so this rule
      // covers all our route patterns. Cached path (last-visited sub-route
      // for this activity) wins when present.
      const target = ctx.client.router.cache[activity?.id] || activity?.path.replace(/\{[^}]*\}/g, '')
      return h('a', {
        href: target,
        onClick: (e: MouseEvent) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
          e.preventDefault()
          if (target) ctx.client.router.router.push(target)
        },
      }, slots.default?.() ?? activity?.name)
    }
  },
})

export default function (app: App) {
  app.component('k-activity-link', KActivityLink)
}
