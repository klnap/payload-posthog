type IdentityClient = {
  identify: (distinctId: string, properties?: Record<string, string | number | boolean>) => void
  reset: () => void
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
  properties: Record<string, string | number | boolean>
): PostHogIdentityState {
  const nextId = posthog.is_capturing() && !posthog.has_opted_out_capturing() ? id : null
  const propertiesKey = nextId ? JSON.stringify(properties) : ''
  if (previous.id === nextId && previous.propertiesKey === propertiesKey) return previous

  if (previous.id !== null && previous.id !== nextId) posthog.reset()
  if (nextId) posthog.identify(nextId, properties)

  return { id: nextId, propertiesKey }
}
