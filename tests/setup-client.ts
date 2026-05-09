import { vi } from 'vitest'

;(globalThis as any).CLIENT_CONFIG = {
  endpoint: '/api',
  heartbeat: null,
  uiPath: '',
}

vi.mock('element-plus/dist/index.css', () => ({}))

vi.mock('marked-vue', () => ({
  default: { template: '<div class="k-markdown"><slot /></div>' },
}))

vi.mock('element-plus', () => {
  const { h } = require('vue') as typeof import('vue')

  const passthrough = (tag: string) => ({
    inheritAttrs: false,
    template: `<${tag} v-bind="$attrs"><slot /></${tag}>`,
  })

  function flatNodes(nodes: any[]): any[] {
    const out: any[] = []
    const walk = (list: any[]) => {
      for (const n of list || []) {
        out.push(n)
        if (!n.collapse && n.children?.length) walk(n.children)
      }
    }
    walk(nodes ?? [])
    return out
  }

  const ElTree = {
    name: 'ElTree',
    props: ['data', 'props', 'nodeKey', 'defaultExpandedKeys', 'currentNodeKey'],
    setup(props: any, { slots, emit }: any) {
      return () => {
        const data = props.data ?? []
        if (!data.length) {
          return h('div', { class: 'el-tree', 'data-empty': true }, [
            h('div', { class: 'el-tree__empty-block' }),
          ])
        }
        const optionProps = props.props || {}
        const computeNodeClass = (n: any) => {
          const base: any = {
            'is-active': n[props.nodeKey] === props.currentNodeKey,
            'is-group': !!n.children?.length,
          }
          if (typeof optionProps.class === 'function') {
            const extra = optionProps.class(n, { data: n })
            if (typeof extra === 'string') {
              for (const w of extra.split(/\s+/).filter(Boolean)) base[w] = true
            } else if (Array.isArray(extra)) {
              for (const w of extra) if (w) base[w] = true
            } else if (extra && typeof extra === 'object') {
              Object.assign(base, extra)
            }
          }
          if (n.class && typeof n.class === 'object') Object.assign(base, n.class)
          return base
        }
        return h('div', { class: 'el-tree' }, flatNodes(data).map((n: any) =>
          h('div', {
            key: n[props.nodeKey],
            class: ['el-tree-node', computeNodeClass(n)],
            onClick: () => emit('node-click', n, { data: n, parent: null, childNodes: [] }),
          }, [
            h('div', { class: 'el-tree-node__content' },
              slots.default ? slots.default({ node: { data: n }, data: n }) : [String(n.label || n[props.nodeKey])],
            ),
          ]),
        ))
      }
    },
  }

  const ElButton = passthrough('button')
  const ElInput = {
    inheritAttrs: false,
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: `<input v-bind="$attrs" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
  }
  const ElPopover = passthrough('div')
  const ElTooltip = passthrough('div')
  const ElScrollbar = passthrough('div')
  const ElDialog = {
    inheritAttrs: false,
    props: ['modelValue'],
    template: `<div v-if="modelValue" class="el-dialog" v-bind="$attrs"><slot /></div>`,
  }

  const Element = {
    install(app: any) {
      app.component('el-tree', ElTree)
      app.component('el-button', ElButton)
      app.component('el-input', ElInput)
      app.component('el-popover', ElPopover)
      app.component('el-tooltip', ElTooltip)
      app.component('el-scrollbar', ElScrollbar)
      app.component('el-dialog', ElDialog)
    },
  }

  return {
    default: Element,
    ElLoading: { service: () => ({ close() {} }) },
    ElMessage: Object.assign(() => {}, {
      success() {}, error() {}, warning() {}, info() {},
    }),
    ElMessageBox: {
      confirm: async () => true,
      alert: async () => true,
      prompt: async () => ({ value: '' }),
    },
  }
})

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // happy-dom doesn't implement reload; loader.ts triggers it on version mismatch.
  if (!('reload' in window.location) || typeof window.location.reload !== 'function') {
    Object.defineProperty(window.location, 'reload', { value: () => {}, configurable: true })
  } else {
    window.location.reload = () => {}
  }

  // The mocked element-plus default export installs el-* components onto each
  // app it touches. ClientService gets them via `app.use(Element)` inside
  // install(); @vue/test-utils' mount() creates its own Vue app though, and
  // we must install them there too so component specs that call mount() see
  // the same global registrations.
  const { config } = await import('@vue/test-utils')
  const ElementMock = (await import('element-plus')).default
  config.global.plugins = [...(config.global.plugins ?? []), ElementMock]
}
