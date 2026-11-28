import type { PersonProperties } from './person-properties'

/** The subset of the native PostHog client used for analytics identity. */
export type AnalyticsIdentityClient = {
  identify: (distinctId: string, properties?: PersonProperties) => void
  reset: () => void
  get_distinct_id: () => string
}

export type AnalyticsIdentityState = {
  distinctId: string | null
  propertiesKey: string
}

type AnalyticsIdentityTarget = {
  distinctId: string
  properties: PersonProperties
} | null

export const ANONYMOUS_IDENTITY: AnalyticsIdentityState = { distinctId: null, propertiesKey: '' }

/**
 * Applies the authenticated Payload user to native analytics identity.
 * Resets before identifying a different user, after logout, and when a persisted Payload
 * identity survives a page load without an authenticated user. Repeats nothing that is unchanged.
 */
export function syncAnalyticsIdentity(
  client: AnalyticsIdentityClient,
  previous: AnalyticsIdentityState,
  target: AnalyticsIdentityTarget,
  identityCollections: readonly string[]
): AnalyticsIdentityState {
  const distinctId = target?.distinctId ?? null
  const propertiesKey = target ? JSON.stringify(target.properties) : ''
  const current = client.get_distinct_id()
  const persisted = identityCollections.some((slug) => current.startsWith(`${slug}:`))
  // A Payload identity persisted across page loads is stale unless it is the current target.
  const stale = persisted && current !== distinctId

  if (previous.distinctId === distinctId && previous.propertiesKey === propertiesKey && !stale) {
    return previous
  }
  if ((previous.distinctId !== null && previous.distinctId !== distinctId) || stale) {
    client.reset()
  }
  if (target) client.identify(target.distinctId, target.properties)
  return { distinctId, propertiesKey }
}
