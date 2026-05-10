// Compile a route pattern using the same syntax as the client router
// (`packages/client/client/plugins/router.ts`). Kept in sync intentionally
// so server-side path matching for the SPA fallback agrees with the
// client-side route table.
//
// Supported tokens:
//   /:name      single segment (no '/')
//   /:name*     zero+ segments — the leading '/' is consumed
export function compilePath(path: string): RegExp {
  const pattern = path
    .replace(/\/:(\w+)\*/g, '(?:/(.*))?')
    .replace(/:(\w+)/g, '([^/]+)')
  return new RegExp('^' + pattern + '/?$')
}
