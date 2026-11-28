import { type NativeAuthRoutes, REDACTED, redactUrl } from './url-redaction'

type Json = unknown

/** Element attributes that carry a URL: posthog-js records each as `attr__<name>`. */
const URL_ATTRIBUTES = new Set([
  'attr__href',
  'attr__src',
  'attr__action',
  'attr__formaction',
  'attr__poster',
])

/** Event properties whose value is a page URL or path, as PostHog's native capture names them. */
function isUrlPropertyKey(key: string): boolean {
  if (URL_ATTRIBUTES.has(key)) return true
  if (!key.startsWith('$')) return false
  return /(url|referrer|pathname)$/i.test(key) && !/domain$/i.test(key)
}

function isPlainObject(value: unknown): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Redacts a URL-valued property. Unparseable values are removed, never passed through. */
/** posthog-js sentinels for "no referrer": not URLs, and they must reach analytics unchanged. */
const NO_REFERRER_SENTINELS = new Set(['', '$direct'])

function redactValue(value: Json, routes: NativeAuthRoutes): Json | undefined {
  // A URL-keyed value that is not a string cannot be redacted safely, so it is dropped.
  if (typeof value !== 'string') return undefined
  if (NO_REFERRER_SENTINELS.has(value)) return value
  return redactUrl(value, routes)
}

function redactProperties(
  properties: Record<string, Json>,
  routes: NativeAuthRoutes
): Record<string, Json> {
  const result: Record<string, Json> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (isUrlPropertyKey(key)) {
      const redacted = redactValue(value, routes)
      if (redacted !== undefined) result[key] = redacted
    } else if ((key === '$set' || key === '$set_once') && isPlainObject(value)) {
      result[key] = redactProperties(value, routes)
    } else if (key === '$elements' && Array.isArray(value)) {
      result[key] = value.map((element) =>
        isPlainObject(element) ? redactProperties(element, routes) : element
      )
    } else if (key === '$snapshot_data' && Array.isArray(value)) {
      result[key] = value.map((item) => redactReplayItem(item, routes))
    } else {
      result[key] = value
    }
  }
  return result
}

const URL_NODE_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'poster'])

/**
 * Native Replay attribute callback (`session_recording.maskAttributeFn`). URL-valued attributes
 * are redacted; every other attribute is returned unchanged. Unparseable URLs are replaced.
 */
export function maskReplayAttribute(name: string, value: string, routes: NativeAuthRoutes): string {
  if (!URL_NODE_ATTRIBUTES.has(name)) return value
  return redactUrl(value, routes) ?? REDACTED
}

/**
 * Incremental DOM mutations (type 3) are plain objects. Attributes with a URL value are redacted
 * wherever they appear in the mutation data (added nodes, attribute changes).
 */
function redactMutationAttributes(value: Json, routes: NativeAuthRoutes): Json {
  if (Array.isArray(value)) return value.map((entry) => redactMutationAttributes(entry, routes))
  if (!isPlainObject(value)) return value
  const result: Record<string, Json> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (URL_NODE_ATTRIBUTES.has(key) && typeof entry === 'string') {
      const redacted = redactUrl(entry, routes)
      if (redacted !== undefined) result[key] = redacted
    } else {
      result[key] = redactMutationAttributes(entry, routes)
    }
  }
  return result
}

/**
 * Replay items in plain data: meta events (type 4) carry the page `href`, and network timing plugin
 * events (type 6) carry resource URLs. Full snapshots are compressed strings and are not rewritten;
 * docs/specification.md records that surface.
 */
function redactReplayItem(item: Json, routes: NativeAuthRoutes): Json {
  if (!isPlainObject(item) || !isPlainObject(item.data)) return item
  if (item.type === 3) return { ...item, data: redactMutationAttributes(item.data, routes) }
  if (item.type === 4 && typeof item.data.href === 'string') {
    return { ...item, data: { ...item.data, href: redactUrl(item.data.href, routes) ?? REDACTED } }
  }
  // Custom Replay events, such as `$url_changed`, carry the page URL in their payload.
  if (item.type === 5 && isPlainObject(item.data.payload)) {
    const href = item.data.payload.href
    if (typeof href === 'string') {
      return {
        ...item,
        data: {
          ...item.data,
          payload: { ...item.data.payload, href: redactUrl(href, routes) ?? REDACTED },
        },
      }
    }
  }
  // Network timing plugin (`rrweb/network@1`): each request carries the resource URL.
  const payload = item.data.payload
  if (item.type === 6 && isPlainObject(payload) && Array.isArray(payload.requests)) {
    const requests = payload.requests.map((request) => {
      if (!isPlainObject(request)) return request
      const name = request.name
      return typeof name === 'string'
        ? { ...request, name: redactUrl(name, routes) ?? REDACTED }
        : request
    })
    return { ...item, data: { ...item.data, payload: { ...payload, requests } } }
  }
  return item
}

/**
 * Returns a redacted copy of a captured event. The input is never mutated, and a capture
 * without properties is passed through unchanged.
 */
export function redactEventUrls<T extends { properties?: unknown }>(
  event: T,
  routes: NativeAuthRoutes
): T {
  if (!isPlainObject(event.properties)) return event
  return { ...event, properties: redactProperties(event.properties, routes) } as T
}
