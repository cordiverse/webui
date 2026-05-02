// Runs before each test file. Sets up globals that the @cordisjs/client shim
// expects, and wires up @vue/test-utils + element-plus for DOM-based tests.

;(globalThis as any).CLIENT_CONFIG = {
  static: true,
  endpoint: '/api',
  heartbeat: null,
}

// Only load DOM-coupled libs when the test file opted into a DOM env via
// `// @vitest-environment happy-dom`. This keeps Node-only specs (e.g. the
// market server E2E) unaffected.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const { config } = await import('@vue/test-utils')
  const ElementPlus = (await import('element-plus')).default
  config.global.plugins = [...(config.global.plugins ?? []), ElementPlus]

  // `@cordisjs/client` normally registers these as global components. Under
  // the shim they're unregistered, so stub with transparent wrappers to keep
  // Vue from printing resolve warnings on every mount.
  const passthrough = (tag: string) => ({ template: `<${tag}><slot /></${tag}>` })
  config.global.stubs = {
    ...config.global.stubs,
    'k-icon': { props: ['name'], template: '<span class="k-icon" :data-name="name" />' },
    'k-slot': passthrough('div'),
    'k-layout': passthrough('div'),
    'k-empty': passthrough('div'),
    'k-content': passthrough('div'),
    'k-comment': passthrough('div'),
    'k-tab-bar': passthrough('div'),
  }
}
