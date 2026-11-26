import { isSafeAdminContentRoute, normalizeGuestRoute } from './guest-route-tracking'

export type SafeAdminPageview = {
  pathname: string
  url: string
}

export function resolveSafeAdminPageview(
  pathname: string,
  search: string,
  adminPath: string,
  origin: string
): SafeAdminPageview | null {
  if (search) return null

  const path = normalizePath(pathname)
  const base = normalizePath(adminPath)
  const adminIndex = base === '/' ? 0 : path.indexOf(base)
  if (
    adminIndex < 0 ||
    (base !== '/' && !['/', undefined].includes(path[adminIndex + base.length]))
  ) {
    return null
  }

  const routePath = base === '/' ? path : path.slice(adminIndex + base.length) || '/'
  const route = normalizeGuestRoute(routePath, '/')
  if (!isSafeAdminContentRoute(route)) return null

  const prefix = path.slice(0, adminIndex)
  const safePath = `${prefix}${base === '/' ? '' : base}${route.pathname}`
  try {
    const url = new URL(safePath, origin)
    return { pathname: route.pathname, url: url.origin + url.pathname }
  } catch {
    return null
  }
}

function normalizePath(path: string): string {
  return `/${path.split(/[?#]/, 1)[0]?.split('/').filter(Boolean).join('/') ?? ''}`
}
