const AUTH_ROUTE_NAMES = new Set([
  'account',
  'bootstrap',
  'create-first-user',
  'forgot',
  'invite',
  'login',
  'logout',
  'logout-inactivity',
  'reset',
  'reset-password',
  'session-ended',
  'set-password',
  'sign-out',
  'unauthorized',
])

const SECRET_ROUTE_NAMES = new Set(['accept', 'callback', 'set-password', 'token', 'verify'])
const SENSITIVE_QUERY_NAMES = new Set([
  'access_token',
  'auth',
  'code',
  'email',
  'id_token',
  'invite_token',
  'key',
  'otp',
  'password',
  'reset_token',
  'secret',
  'session',
  'state',
  'token',
])

export type GuestRoute = {
  pathname: string
  route: string
  authFlow: string | null
  sensitive: boolean
}

/** Matches a public auth path, or a path nested under it, relative to the Admin route. */
export function isGuestRouteTracked(
  pathname: string,
  adminPath: string,
  guestPaths: readonly string[]
): boolean {
  const path = normalizedPath(pathname, adminPath)
  return guestPaths.some((guestPath) => {
    const base = normalizedPath(guestPath, '/')
    return path === base || path.startsWith(`${base}/`)
  })
}

export function isSafeAdminContentRoute(route: GuestRoute): boolean {
  return (
    !route.sensitive &&
    !route.pathname.includes('[redacted]') &&
    (route.pathname === '/' || /^\/(collections|globals)\//.test(route.pathname))
  )
}

export function isSafeAdminSupportRoute(route: GuestRoute, query: string): boolean {
  return (
    !route.sensitive && route.route !== '/custom-admin-route' && !hasSensitiveQueryParameters(query)
  )
}

export function hasSensitiveQueryParameters(query: string): boolean {
  for (const [key, value] of new URLSearchParams(query)) {
    if (SENSITIVE_QUERY_NAMES.has(key.toLowerCase())) return true
    if (
      /(?:^|\/)(?:reset|reset-password|invite|invitation|callback|verify|recovery)(?:\/|$)/i.test(
        value
      )
    ) {
      return true
    }
  }
  return false
}

function normalizedPath(pathname: string, adminPath: string): string {
  const path = `/${pathname.split('/').filter(Boolean).join('/')}`
  const base = `/${adminPath.split('/').filter(Boolean).join('/')}`
  if (base !== '/' && (path === base || path.startsWith(`${base}/`))) {
    return path.slice(base.length) || '/'
  }
  return path
}

function isTokenSegment(segment: string): boolean {
  if (/^[\w-]{20,}$/.test(segment)) return true
  return (
    segment.length >= 24 &&
    /^[\da-z_-]+$/i.test(segment) &&
    /[a-z]/i.test(segment) &&
    /\d/.test(segment)
  )
}

function flowFor(route: string): string | null {
  const segments = route.toLowerCase().split('/').filter(Boolean)
  const root = segments[0]
  if (['login', 'sign-in'].includes(root ?? '')) return 'login'
  if (['forgot', 'recovery'].includes(root ?? '')) return 'password_recovery'
  if (['reset', 'reset-password', 'set-password'].includes(root ?? '')) return 'password_reset'
  if (['invite', 'invitation'].includes(root ?? '')) return 'invitation'
  if (['bootstrap', 'create-first-user'].includes(root ?? '')) return 'bootstrap'
  if (['sign-out', 'logout'].includes(root ?? '')) return 'logout'
  if (['logout-inactivity', 'session-ended'].includes(root ?? '')) return 'session_expired'
  if (root === 'auth' && ['callback', 'verify'].includes(segments[1] ?? '')) return 'authentication'
  return null
}

export function normalizeGuestRoute(pathname: string, adminPath = '/'): GuestRoute {
  const path = normalizedPath(pathname.split(/[?#]/, 1)[0] ?? '/', adminPath)
  const segments = path.split('/')
  const redactedSegments = segments.map((segment, index) => {
    const previous = segments[index - 1]?.toLowerCase()
    if (
      (previous === 'reset' ||
        (previous === 'invite' && segment.toLowerCase() !== 'accept') ||
        SECRET_ROUTE_NAMES.has(previous ?? '') ||
        isTokenSegment(segment)) &&
      segment
    ) {
      return '[redacted]'
    }
    return segment
  })
  const rawRoute = redactedSegments.join('/')
  const flow = flowFor(rawRoute)
  const root = redactedSegments[1]?.toLowerCase()
  const route =
    root === 'collections' || root === 'globals'
      ? redactedSegments.length <= 3
        ? rawRoute
        : `${redactedSegments.slice(0, 3).join('/')}/[id]`
      : root === 'auth' && redactedSegments[2]?.toLowerCase() === 'callback'
        ? redactedSegments.slice(0, 4).join('/')
        : AUTH_ROUTE_NAMES.has(root ?? '') || root === 'auth'
          ? rawRoute
          : path === '/'
            ? '/'
            : '/custom-admin-route'
  const sensitive =
    flow !== null ||
    redactedSegments.includes('[redacted]') ||
    rawRoute
      .toLowerCase()
      .split('/')
      .some((segment) => AUTH_ROUTE_NAMES.has(segment))

  return {
    pathname: route,
    route,
    authFlow: flow,
    sensitive,
  }
}
