/**
 * Rejects function values anywhere in plugin options. Payload passes plugin props across the
 * Server Component boundary, which cannot carry callbacks, so they must fail here, not silently.
 */
export function assertSerializable(value: unknown, path: string): void {
  if (typeof value === 'function') {
    throw new Error(
      `PostHog: ${path} must be serializable; callbacks cannot cross the Payload server-to-client boundary. Configure them in a host-owned client integration.`
    )
  }
  if (typeof value !== 'object' || value === null) return
  for (const [key, child] of Object.entries(value)) {
    assertSerializable(child, `${path}.${key}`)
  }
}
