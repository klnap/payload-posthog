type IdentityClient = {
  identify: (distinctId: string, properties?: Record<string, string | number | boolean>) => void
  reset: () => void
  get_distinct_id: () => string
  is_capturing: () => boolean
  has_opted_out_capturing: () => boolean
}

export type PostHogIdentityState = {
  id: string | null
  propertiesKey: string
}

export function syncPostHogIdentity(
  posthog: IdentityClient,
  previous: PostHogIdentityState,
  id: string | null,
  properties: Record<string, string | number | boolean>,
  identityCollection: string
): PostHogIdentityState {
  const nextId = posthog.is_capturing() && !posthog.has_opted_out_capturing() ? id : null
  const propertiesKey = nextId ? JSON.stringify(properties) : ''
  const currentId = posthog.get_distinct_id()
  const persistedPayloadIdentity =
    currentId.startsWith(`${identityCollection}:`) && currentId !== nextId
  if (
    previous.id === nextId &&
    previous.propertiesKey === propertiesKey &&
    !persistedPayloadIdentity
  ) {
    return previous
  }

  if ((previous.id !== null && previous.id !== nextId) || persistedPayloadIdentity) posthog.reset()
  if (nextId) posthog.identify(nextId, properties)

  return { id: nextId, propertiesKey }
}
