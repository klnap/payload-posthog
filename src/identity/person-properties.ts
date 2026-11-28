export type PersonPropertyValue = string | number | boolean
export type PersonProperties = Record<string, PersonPropertyValue | PersonPropertyValue[]>

const UNSAFE_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype'])
const CREDENTIAL_SEGMENT =
  /password|passwd|token|secret|salt|hash|apikey|api_key|enableapikey|verification|reset|session/i

/** Returns true for path segments that must never reach PostHog as person properties. */
export function isCredentialPath(path: string): boolean {
  return path.split('.').some((segment) => CREDENTIAL_SEGMENT.test(segment.replace(/\[\]$/, '')))
}

function isPrimitive(value: unknown): value is PersonPropertyValue {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
}

function readOwn(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || UNSAFE_SEGMENTS.has(key)) return undefined
  return Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined
}

/**
 * Resolves one value. Returns undefined when the path does not exist, a value is not
 * primitive, or every item of a nonempty array is unresolved.
 */
function resolveSegments(value: unknown, segments: readonly string[]): unknown {
  if (segments.length === 0) return value
  const [segment = '', ...rest] = segments
  const projected = segment.endsWith('[]')
  const key = projected ? segment.slice(0, -2) : segment
  const current = key ? readOwn(value, key) : value
  if (!projected) return resolveSegments(current, rest)
  if (!Array.isArray(current)) return undefined
  const items = current.flatMap((item) => {
    const resolved = resolveSegments(item, rest)
    if (resolved === undefined) return []
    return Array.isArray(resolved) ? resolved : [resolved]
  })
  // A nonempty relationship array that resolves to nothing is unknown, not empty.
  return current.length > 0 && items.length === 0 ? undefined : items
}

/**
 * Reads a configured person property. Paths use dots; `name[]` projects over an array.
 * Primitive arrays keep primitive entries and skip populated documents.
 */
export function resolvePersonProperty(
  source: unknown,
  path: string
): PersonPropertyValue | PersonPropertyValue[] | undefined {
  if (isCredentialPath(path)) return undefined
  const resolved = resolveSegments(source, path.split('.'))
  if (isPrimitive(resolved)) return resolved
  if (!Array.isArray(resolved)) return undefined
  const primitives = resolved.filter(isPrimitive)
  // Keep an array that is empty in the source; drop one whose entries were all unsupported.
  if (resolved.length > 0 && primitives.length === 0) return undefined
  return primitives
}

/** Builds the PostHog person properties for the configured mapping. Missing values are omitted. */
export function resolvePersonProperties(
  source: unknown,
  mapping: Readonly<Record<string, string>>
): PersonProperties {
  const properties: PersonProperties = {}
  for (const [name, path] of Object.entries(mapping)) {
    const value = resolvePersonProperty(source, path)
    if (value !== undefined) properties[name] = value
  }
  return properties
}
