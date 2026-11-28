export const REDACTED = '[REDACTED]'

/** Native Payload Admin routes whose path segment after the route name is a credential. */
export type NativeAuthRoutes = {
  /** `routes.admin`, for example `/admin`. Empty string means the site root. */
  adminRoute: string
  /** `admin.routes.reset`, for example `/reset`. */
  resetRoute: string
}

const BASE = 'http://redaction.invalid'

function segments(path: string): string[] {
  return path.split('/').filter(Boolean)
}

/**
 * Redacts the credential segment of a confirmed native Payload path:
 * `<admin>/<reset>/<token>` and `<admin>/<collection>/verify/<token>`.
 * The Admin prefix is matched at any offset, because Next.js `basePath` (`NEXT_BASE_PATH`) is
 * prepended to Payload's absolute links and the plugin does not know it at runtime. Matching uses
 * the non-empty segments, and the replacement is written back at the original position, so
 * repeated slashes cannot move the redaction onto another segment.
 */
function redactPathSegments(path: string, routes: NativeAuthRoutes): string {
  const parts = path.split('/')
  // Original indexes of the non-empty segments, in order.
  const positions = parts.flatMap((part, index) => (part ? [index] : []))
  const names = positions.map((index) => parts[index] as string)
  const adminParts = segments(routes.adminRoute)
  const resetParts = segments(routes.resetRoute)
  for (let start = 0; start + adminParts.length <= names.length; start++) {
    if (!adminParts.every((part, index) => names[start + index] === part)) continue
    const rest = names.slice(start + adminParts.length)
    const isReset = resetParts.length > 0 && resetParts.every((part, index) => rest[index] === part)
    const isVerify = rest.length >= 3 && rest[1] === 'verify'
    const tokenRelative = isReset ? resetParts.length : isVerify ? 2 : -1
    const tokenPosition = positions[start + adminParts.length + tokenRelative]
    if (tokenRelative >= 0 && tokenPosition !== undefined) {
      parts[tokenPosition] = REDACTED
      return parts.join('/')
    }
  }
  return path
}

/**
 * Returns a redacted URL, or undefined when the value cannot be parsed. Callers must drop the
 * value in that case instead of sending the original.
 *
 * Rules: fragment removed; username and password removed; every query value replaced with
 * `[REDACTED]` while names and order are kept; confirmed native credential path segments replaced.
 * Idempotent, because `[REDACTED]` is preserved and the output contains no fragment.
 */
export function redactUrl(value: string, routes: NativeAuthRoutes): string | undefined {
  let url: URL
  try {
    url = new URL(value, BASE)
  } catch {
    return undefined
  }
  const absolute = /^[a-z][a-z\d+.-]*:/i.test(value)
  // `localhost:3000/...` parses as scheme `localhost:` with an empty host: fail closed.
  if (absolute && !url.host) return undefined
  const path = redactPathSegments(url.pathname, routes)
  const query = url.search
    ? `?${[...url.searchParams.keys()]
        .map((name) => `${encodeURIComponent(name)}=${REDACTED}`)
        .join('&')}`
    : ''
  if (!absolute) return `${path}${query}`
  return `${url.protocol}//${url.host}${path}${query}`
}
