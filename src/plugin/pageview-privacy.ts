import { isSafeAdminContentRoute, normalizeGuestRoute } from './guest-route-tracking'

export type SafeAdminPageview = {
  pathname: string
  resourceRoute: string | null
  url: string
}

export function resolveSafeAdminPageview(
  pathname: string,
  search: string,
  adminPath: string,
  origin: string
): SafeAdminPageview | null {
  if (!isSafeAdminSearch(search)) return null

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
    return {
      pathname: route.pathname,
      resourceRoute: resolveResourceRoute(routePath),
      url: url.origin + url.pathname,
    }
  } catch {
    return null
  }
}

function resolveResourceRoute(routePath: string): string | null {
  const segments = routePath.split('/').filter(Boolean)
  if (segments[0] === 'collections' && segments.length === 2) return routePath
  if (
    segments[0] === 'collections' &&
    segments.length === 3 &&
    !['create', 'new'].includes(segments[2]?.toLowerCase() ?? '')
  ) {
    return `/collections/${segments[1]}/[id]`
  }
  if (segments[0] === 'globals' && segments.length === 2) return routePath
  return null
}

function isSafeAdminSearch(search: string): boolean {
  const entries = [...new URLSearchParams(search)]
  return (
    entries.every(([key, value]) => (key === 'depth' || key === 'limit') && /^\d+$/.test(value)) &&
    new Set(entries.map(([key]) => key)).size === entries.length
  )
}

function normalizePath(path: string): string {
  return `/${path.split(/[?#]/, 1)[0]?.split('/').filter(Boolean).join('/') ?? ''}`
}
