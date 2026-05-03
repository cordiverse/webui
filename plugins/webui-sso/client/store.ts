import { reactive } from 'vue'
import type { Identity, ProviderMeta, User } from '../shared'

const TOKEN_KEY = 'cordis:webui-sso:token'

interface SsoStore {
  token: string | null
  user: User | null
  ready: boolean
}

export const store = reactive<SsoStore>({
  token: localStorage.getItem(TOKEN_KEY),
  user: null,
  ready: false,
})

function setToken(token: string | null) {
  store.token = token
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

async function request<T>(method: string, path: string, body?: any, withAuth = false): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (withAuth && store.token) headers['authorization'] = `Bearer ${store.token}`
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let code = `HTTP_${res.status}`
    try {
      const data = await res.json()
      if (data?.error) code = data.error
    } catch {}
    if (res.status === 401 && withAuth) {
      // Stale token; clear locally so UI returns to logged-out state.
      setToken(null)
      store.user = null
    }
    throw new SsoError(code, res.status)
  }
  if (res.status === 204) return undefined as T
  return await res.json() as T
}

export class SsoError extends Error {
  constructor(public code: string, public status: number) {
    super(code)
  }
}

export async function refresh(): Promise<void> {
  if (!store.token) {
    store.user = null
    store.ready = true
    return
  }
  try {
    store.user = await request<User>('GET', '/sso/me', undefined, true)
  } catch (e) {
    store.user = null
  } finally {
    store.ready = true
  }
}

export async function listProviders(): Promise<ProviderMeta[]> {
  return await request<ProviderMeta[]>('GET', '/sso/providers')
}

export async function login(provider: string, credentials: any): Promise<void> {
  const { token } = await request<{ token: string }>('POST', `/sso/auth/${provider}`, credentials)
  setToken(token)
  await refresh()
}

export async function register(provider: string, credentials: any): Promise<void> {
  const { token } = await request<{ token: string }>('POST', `/sso/register/${provider}`, credentials)
  setToken(token)
  await refresh()
}

export async function challenge(provider: string, target: any): Promise<{ challengeId: string }> {
  return await request<{ challengeId: string }>('POST', `/sso/challenge/${provider}`, target)
}

export async function verify(provider: string, challengeId: string, response: string): Promise<void> {
  await request<{ ok: true }>('POST', `/sso/verify/${provider}`, { challengeId, response })
}

export async function logout(): Promise<void> {
  try {
    await request('POST', '/sso/logout', {}, true)
  } catch {}
  setToken(null)
  store.user = null
}

export async function listIdentities(): Promise<Identity[]> {
  return await request<Identity[]>('GET', '/sso/identities', undefined, true)
}

export async function link(provider: string, _credentials: any): Promise<{ identityId: number }> {
  // sso-server's POST /sso/link/:provider creates an identity row but does NOT
  // call provider.register. For password/mail this means the new identity is
  // unusable until a follow-up register call (which we don't currently have a
  // scoped endpoint for). For OAuth-style providers it's enough on its own,
  // because the provider's register() is invoked on the callback path.
  // v1 supports OAuth linking via this. password/mail linking is best-effort:
  // we surface the identityId so the UI can hint at the limitation.
  return await request<{ identityId: number }>('POST', `/sso/link/${provider}`, {}, true)
}

export async function unlink(identityId: number): Promise<void> {
  await request<{ ok: true }>('POST', `/sso/unlink/${identityId}`, {}, true)
}

const OAUTH_STATE_KEY = 'cordis:webui-sso:oauth-state'
const OAUTH_INTENT_KEY = 'cordis:webui-sso:oauth-intent'

export function buildOAuthRedirectUri(): string {
  const url = new URL(location.href)
  url.hash = '#/sso'
  url.search = ''
  return url.toString()
}

export async function getAuthUrl(provider: string): Promise<string> {
  const state = crypto.randomUUID()
  sessionStorage.setItem(OAUTH_STATE_KEY, state)
  sessionStorage.setItem(OAUTH_INTENT_KEY, provider)
  const params = new URLSearchParams({
    redirect_uri: buildOAuthRedirectUri(),
    state,
  })
  const { url } = await request<{ url: string }>('GET', `/sso/auth/${provider}?${params}`)
  return url
}

// Parse the URL fragment after returning from an OAuth callback. The sso
// callback handler redirects to redirect_uri with `#token=...` (or
// `#error=...`) appended. We pull the token out, persist it, and scrub the
// fragment so the page state doesn't keep the token visible in the address
// bar after a refresh.
export function consumeOAuthCallback(): { token?: string; error?: string } {
  const hash = location.hash
  // Hash routes look like `#/sso` — only treat fragments that contain `=` as
  // an OAuth callback payload.
  const queryStart = hash.lastIndexOf('?')
  const params = new URLSearchParams(queryStart >= 0 ? hash.slice(queryStart + 1) : '')
  const tokenFromQuery = params.get('token') ?? undefined
  const errorFromQuery = params.get('error') ?? undefined
  // Some callbacks may put the payload directly after `#` (no route prefix).
  // We probe for that shape too.
  let token = tokenFromQuery
  let error = errorFromQuery
  if (!token && !error && hash.startsWith('#') && hash.includes('=') && !hash.startsWith('#/')) {
    const flat = new URLSearchParams(hash.slice(1))
    token = flat.get('token') ?? undefined
    error = flat.get('error') ?? undefined
  }
  if (!token && !error) return {}

  // Strip the OAuth params; keep the route prefix.
  if (queryStart >= 0) {
    history.replaceState(null, '', location.pathname + location.search + hash.slice(0, queryStart))
  } else {
    history.replaceState(null, '', location.pathname + location.search + '#/sso')
  }

  if (token) {
    setToken(token)
    sessionStorage.removeItem(OAUTH_STATE_KEY)
    sessionStorage.removeItem(OAUTH_INTENT_KEY)
  }
  return { token, error }
}
