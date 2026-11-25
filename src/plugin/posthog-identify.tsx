'use client'

import { useAuth } from '@payloadcms/ui'
import { usePostHog } from '@posthog/next'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { payloadDistinctId } from '../identity/payload-distinct-id'
import { syncPostHogIdentity } from '../identity/sync-posthog-identity'
import {
  hasSensitiveQueryParameters,
  isSafeAdminContentRoute,
  normalizeGuestRoute,
} from './guest-route-tracking'

export function PostHogIdentify({
  collection,
  properties = {},
  adminPath = '/admin',
}: {
  collection?: string
  properties?: Record<string, string>
  adminPath?: string
}) {
  const posthog = usePostHog()
  const canIdentify =
    (posthog?.is_capturing() ?? false) && !(posthog?.has_opted_out_capturing() ?? true)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const previousId = useRef<string | null>(null)
  const previousPropertiesKey = useRef('')
  const route = normalizeGuestRoute(pathname ?? '/', adminPath)
  const safeRoute =
    isSafeAdminContentRoute(route) && !hasSensitiveQueryParameters(searchParams.toString())
  const userId = collection && user?.id != null ? payloadDistinctId(collection, user.id) : null
  const personProperties = Object.fromEntries(
    Object.entries(properties)
      .map(([property, field]) => [property, user?.[field]])
      .filter(
        (entry): entry is [string, string | number | boolean] =>
          typeof entry[1] === 'string' ||
          typeof entry[1] === 'number' ||
          typeof entry[1] === 'boolean'
      )
  )
  useEffect(() => {
    if (!posthog) return
    const next = syncPostHogIdentity(
      posthog,
      { id: previousId.current, propertiesKey: previousPropertiesKey.current },
      canIdentify && safeRoute ? userId : null,
      personProperties
    )
    previousId.current = next.id
    previousPropertiesKey.current = next.propertiesKey
  }, [canIdentify, personProperties, posthog, safeRoute, userId])

  return null
}
